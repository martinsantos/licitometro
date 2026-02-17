"""
Authentication router - login/logout/check/register endpoints.
"""

from datetime import datetime
from fastapi import APIRouter, Response, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import logging

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.auth_service import (
    authenticate_user,
    create_access_token,
    create_public_access_token,
    verify_token,
    hash_password,
)
from db.models import user_entity

logger = logging.getLogger("auth_router")

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    role: str = "viewer"
    name: str = ""


class TokenLoginRequest(BaseModel):
    token: str


def _get_db(request: Request):
    return request.app.mongodb


def _is_https(request: Request) -> bool:
    """Detect if the original request was over HTTPS (handles Cloudflare/proxy)."""
    if request.headers.get("x-forwarded-proto") == "https":
        return True
    if request.url.scheme == "https":
        return True
    return False


@router.post("/login")
async def login(body: LoginRequest, request: Request):
    """Authenticate with email and password."""
    db = _get_db(request)
    user = await authenticate_user(db, body.email, body.password)
    if not user:
        return JSONResponse(
            status_code=401,
            content={"detail": "Email o contraseña incorrectos"},
        )

    token = create_access_token(user["email"], user["role"])

    response = JSONResponse(content={
        "message": "Authenticated",
        "role": user["role"],
        "email": user["email"],
    })
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=_is_https(request),
        max_age=86400,  # 24 hours
        path="/",
    )
    return response


@router.get("/check")
async def check_auth(request: Request):
    """Check if the current session is authenticated. Returns role and email."""
    # If DISABLE_AUTH is active, middleware already set user_role/user_email
    if hasattr(request.state, "user_role") and request.state.user_role:
        return {
            "authenticated": True,
            "role": request.state.user_role,
            "email": getattr(request.state, "user_email", ""),
        }

    token = request.cookies.get("access_token")
    if not token:
        return JSONResponse(status_code=401, content={"authenticated": False})

    token_data = verify_token(token)
    if token_data["valid"]:
        return {
            "authenticated": True,
            "role": token_data["role"],
            "email": token_data["email"],
        }
    return JSONResponse(
        status_code=401,
        content={"authenticated": False},
    )


@router.post("/token-login")
async def token_login(body: TokenLoginRequest, request: Request):
    """Exchange a public access token for a session cookie."""
    token_data = verify_token(body.token)
    if not token_data["valid"]:
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid or expired token"},
        )

    # Create a viewer-level session so the SPA works normally
    token = create_access_token("reader", "reader")
    response = JSONResponse(content={"message": "Authenticated"})
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=_is_https(request),
        max_age=86400,
        path="/",
    )
    return response


@router.post("/logout")
async def logout(response: Response):
    """Clear the authentication cookie."""
    response = JSONResponse(content={"message": "Logged out"})
    response.delete_cookie("access_token", path="/")
    return response


@router.post("/register")
async def register(body: RegisterRequest, request: Request):
    """Create a new user account. Admin only (enforced by middleware)."""
    db = _get_db(request)

    # Check if email already exists
    existing = await db.users.find_one({"email": body.email})
    if existing:
        return JSONResponse(
            status_code=400,
            content={"detail": "Ya existe un usuario con ese email"},
        )

    if body.role not in ("admin", "viewer"):
        return JSONResponse(
            status_code=400,
            content={"detail": "Rol debe ser 'admin' o 'viewer'"},
        )

    user_doc = {
        "email": body.email,
        "password_hash": hash_password(body.password),
        "role": body.role,
        "name": body.name,
        "active": True,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    return user_entity(user_doc)


@router.get("/users")
async def list_users(request: Request):
    """List all users. Admin only."""
    # GET routes pass through middleware, so check role here
    token = request.cookies.get("access_token")
    token_data = verify_token(token)
    if token_data.get("role") != "admin":
        return JSONResponse(status_code=403, content={"detail": "Acceso de administrador requerido"})
    db = _get_db(request)
    users = await db.users.find().to_list(100)
    return [user_entity(u) for u in users]


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request):
    """Delete a user. Admin only (enforced by middleware)."""
    from db.models import str_to_mongo_id
    db = _get_db(request)

    # Prevent self-deletion
    token = request.cookies.get("access_token")
    token_data = verify_token(token)
    user = await db.users.find_one({"_id": str_to_mongo_id(user_id)})
    if user and user["email"] == token_data.get("email"):
        return JSONResponse(
            status_code=400,
            content={"detail": "No puedes eliminarte a ti mismo"},
        )

    result = await db.users.delete_one({"_id": str_to_mongo_id(user_id)})
    if result.deleted_count == 0:
        return JSONResponse(status_code=404, content={"detail": "Usuario no encontrado"})
    return {"message": "Usuario eliminado"}
