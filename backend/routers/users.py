"""
User management — invitation lifecycle and password resets.

Admin-only endpoints (under /api/users) for creating invitations,
plus public endpoints (under /api/public/users) for the user-facing
activation, password reset, and login flows.

The actual login + password storage uses the existing auth_service
(bcrypt + JWT cookie). This module only handles the invitation flow
on top: create invitation → email link → user lands on /activar →
sets password → account becomes active.
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

logger = logging.getLogger(__name__)

# ============================================================
# Admin-only router (auth required by middleware)
# ============================================================
admin_router = APIRouter(
    prefix="/api/users",
    tags=["users-admin"],
    responses={401: {"description": "Unauthorized"}, 403: {"description": "Forbidden"}},
)

# ============================================================
# Public router (auth-exempt via /api/public/ prefix)
# ============================================================
public_router = APIRouter(
    prefix="/api/public/users",
    tags=["users-public"],
)


# ============================================================
# Pydantic models
# ============================================================
class InviteUserRequest(BaseModel):
    email: EmailStr
    nombre: str = Field(..., min_length=2, max_length=120)
    role: str = Field("viewer", pattern=r"^(viewer|cotizador|admin)$")


class ActivateRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=200)
    password: str = Field(..., min_length=8, max_length=200)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=200)
    password: str = Field(..., min_length=8, max_length=200)


class TestEmailRequest(BaseModel):
    to: EmailStr


# ============================================================
# Helpers
# ============================================================
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _generate_token() -> str:
    """URL-safe random token, 32 bytes (43 chars base64)."""
    return secrets.token_urlsafe(32)


def _require_admin(request: Request) -> str:
    """Read role from middleware-set request.state and 403 if not admin."""
    role = getattr(request.state, "user_role", None)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Solo admins pueden ejecutar esta acción")
    email = getattr(request.state, "user_email", "") or "admin"
    return email


# ============================================================
# Admin: invite a user
# ============================================================
@admin_router.post("/invite")
async def invite_user(body: InviteUserRequest, request: Request):
    """
    Create a user invitation:
      1. Insert (or upsert) a `users` doc with status='invited'
      2. Generate an activation token (7 days TTL)
      3. Send the invitation email via user_email_service
    """
    invited_by = _require_admin(request)
    db = request.app.mongodb
    email = body.email.lower().strip()

    # Reject if user is already active
    existing = await db.users.find_one({"email": email})
    if existing and existing.get("status") == "active":
        raise HTTPException(status_code=400, detail="Ya existe un usuario activo con ese email")

    token = _generate_token()
    expires = _now() + timedelta(days=7)

    user_doc = {
        "email": email,
        "nombre": body.nombre.strip(),
        "role": body.role,
        "status": "invited",
        "invited_at": _now(),
        "invited_by": invited_by,
        "activation_token": token,
        "activation_expires_at": expires,
        "password_hash": None,
        "last_login_at": None,
    }
    await db.users.update_one({"email": email}, {"$set": user_doc}, upsert=True)

    # Send the invitation email (best-effort — don't fail the API call on SMTP error)
    try:
        from services import user_email_service
        sent = await user_email_service.send_invitation(
            to=email, nombre=body.nombre, activation_token=token,
            invited_by=invited_by if "@" in invited_by else None,
        )
    except Exception as exc:
        logger.exception("Failed to send invitation email: %s", exc)
        sent = False

    return {
        "success": True,
        "email": email,
        "expires_at": expires.isoformat(),
        "email_sent": sent,
    }


@admin_router.post("/test-email")
async def send_test_email(body: TestEmailRequest, request: Request):
    """Quick admin tool: send a test email to verify SMTP works end-to-end."""
    _require_admin(request)
    from services import user_email_service
    sent = await user_email_service.send_test(to=body.to)
    if not sent:
        raise HTTPException(status_code=500, detail="No se pudo enviar el email — revisá los logs del backend")
    return {"success": True, "to": body.to}


@admin_router.get("/list")
async def list_users(request: Request, status: Optional[str] = None):
    """List users (optionally filtered by status: invited|active|disabled)."""
    _require_admin(request)
    db = request.app.mongodb
    query = {}
    if status:
        query["status"] = status
    cursor = db.users.find(query, {"password_hash": 0, "activation_token": 0, "reset_token": 0}).sort("invited_at", -1)
    items = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        for k in ("invited_at", "activation_expires_at", "last_login_at"):
            if isinstance(doc.get(k), datetime):
                doc[k] = doc[k].isoformat()
        items.append(doc)
    return {"items": items, "count": len(items)}


@admin_router.delete("/{user_id}")
async def delete_user(user_id: str, request: Request):
    """Soft-delete: mark user as disabled."""
    _require_admin(request)
    db = request.app.mongodb
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="user_id inválido")
    res = await db.users.update_one({"_id": oid}, {"$set": {"status": "disabled", "disabled_at": _now()}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"success": True}


# ============================================================
# Public: activate account (set password from invitation token)
# ============================================================
@public_router.post("/activate")
async def activate_account(body: ActivateRequest, request: Request):
    db = request.app.mongodb
    user = await db.users.find_one({
        "activation_token": body.token,
        "status": "invited",
    })
    if not user:
        raise HTTPException(status_code=400, detail="Token inválido o cuenta ya activada")

    expires = user.get("activation_expires_at")
    if isinstance(expires, datetime) and expires < _now():
        raise HTTPException(status_code=400, detail="El token expiró. Pedí una nueva invitación.")

    # Hash the password using the same mechanism as the existing auth_service
    import bcrypt
    pw_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": pw_hash,
                "status": "active",
                "activated_at": _now(),
            },
            "$unset": {
                "activation_token": "",
                "activation_expires_at": "",
            },
        },
    )

    # Send welcome email (best-effort)
    try:
        from services import user_email_service
        await user_email_service.send_welcome(to=user["email"], nombre=user.get("nombre", ""))
    except Exception as exc:
        logger.warning("welcome email failed: %s", exc)

    return {"success": True, "email": user["email"], "message": "Cuenta activada"}


# ============================================================
# Public: forgot password — sends reset link
# ============================================================
@public_router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, request: Request):
    db = request.app.mongodb
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email, "status": "active"})

    # Always return success to avoid email enumeration attacks
    if user:
        token = _generate_token()
        expires = _now() + timedelta(hours=1)
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"reset_token": token, "reset_expires_at": expires}},
        )
        try:
            from services import user_email_service
            await user_email_service.send_password_reset(
                to=email, nombre=user.get("nombre", ""), reset_token=token,
            )
        except Exception as exc:
            logger.warning("password reset email failed: %s", exc)

    return {"success": True, "message": "Si el email existe, te enviamos un link de reset"}


@public_router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, request: Request):
    db = request.app.mongodb
    user = await db.users.find_one({
        "reset_token": body.token,
        "status": "active",
    })
    if not user:
        raise HTTPException(status_code=400, detail="Token inválido")

    expires = user.get("reset_expires_at")
    if isinstance(expires, datetime) and expires < _now():
        raise HTTPException(status_code=400, detail="El token expiró")

    import bcrypt
    pw_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {"password_hash": pw_hash, "password_changed_at": _now()},
            "$unset": {"reset_token": "", "reset_expires_at": ""},
        },
    )

    return {"success": True, "message": "Contraseña actualizada"}
