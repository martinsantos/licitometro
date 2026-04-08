"""
Public API endpoints — no authentication required.

Serves publicly shared licitaciones for external viewers and
accepts inbound lead forms (demo requests).
"""

import logging
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr, Field

from db.repositories import LicitacionRepository
from dependencies import get_licitacion_repository

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/public",
    tags=["public"],
    responses={404: {"description": "Not found"}},
)


# ============================================================
# Demo requests — lead form from the manual / landing page
# ============================================================
class DemoRequest(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=120)
    empresa: str = Field(..., min_length=2, max_length=200)
    email: EmailStr
    telefono: Optional[str] = Field(None, max_length=40)
    mensaje: Optional[str] = Field(None, max_length=2000)


# Simple in-memory rate limit: max 5 requests per IP per hour
_demo_rate: dict = {}
_DEMO_RATE_WINDOW = 3600
_DEMO_RATE_MAX = 5


def _rate_limit_ok(ip: str) -> bool:
    now = datetime.now(timezone.utc).timestamp()
    window_start = now - _DEMO_RATE_WINDOW
    history = [t for t in _demo_rate.get(ip, []) if t > window_start]
    if len(history) >= _DEMO_RATE_MAX:
        _demo_rate[ip] = history
        return False
    history.append(now)
    _demo_rate[ip] = history
    return True


@router.post("/demo-request")
async def submit_demo_request(body: DemoRequest, request: Request):
    """
    Accept a lead form from the manual / landing page.

    Stores the request in the `demo_requests` collection and sends a
    Telegram notification to the admin chat so they can reach out.
    """
    client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() \
        or (request.client.host if request.client else "unknown")

    if not _rate_limit_ok(client_ip):
        raise HTTPException(status_code=429, detail="Demasiadas solicitudes. Probá en una hora.")

    # Basic sanity: strip control chars
    def clean(s: Optional[str]) -> Optional[str]:
        if s is None:
            return None
        return re.sub(r"[\x00-\x1f\x7f]", "", s).strip()

    doc = {
        "nombre": clean(body.nombre),
        "empresa": clean(body.empresa),
        "email": body.email.lower(),
        "telefono": clean(body.telefono),
        "mensaje": clean(body.mensaje),
        "ip": client_ip,
        "user_agent": request.headers.get("user-agent", "")[:500],
        "referer": request.headers.get("referer", "")[:500],
        "received_at": datetime.now(timezone.utc),
        "status": "new",
    }

    # Persist
    try:
        db = request.app.mongodb
        result = await db.demo_requests.insert_one(doc)
        doc_id = str(result.inserted_id)
    except Exception as exc:
        logger.exception("Failed to persist demo request: %s", exc)
        raise HTTPException(status_code=500, detail="Error interno guardando la solicitud")

    # Telegram notification (best-effort, never fails the request)
    try:
        from services.notification_service import get_notification_service
        svc = get_notification_service(request.app.mongodb)
        lines = [
            "🎯 *Nueva solicitud de DEMO*",
            "",
            f"👤 *{doc['nombre']}* ({doc['empresa']})",
            f"📧 {doc['email']}",
        ]
        if doc["telefono"]:
            lines.append(f"📱 {doc['telefono']}")
        if doc["mensaje"]:
            lines.append("")
            lines.append(f"💬 _{doc['mensaje'][:500]}_")
        lines.append("")
        lines.append(f"🌐 {doc['referer'] or '—'}")
        await svc.send_telegram("\n".join(lines))
    except Exception as exc:
        logger.warning("Telegram notification for demo request failed: %s", exc)

    # Email notification (best-effort)
    try:
        from services.notification_service import get_notification_service
        svc = get_notification_service(request.app.mongodb)
        subject = f"[DEMO] {doc['nombre']} — {doc['empresa']}"
        html = f"""
        <h2>Nueva solicitud de demo</h2>
        <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
          <tr><td style="padding:6px 12px;"><strong>Nombre:</strong></td><td>{doc['nombre']}</td></tr>
          <tr><td style="padding:6px 12px;"><strong>Empresa:</strong></td><td>{doc['empresa']}</td></tr>
          <tr><td style="padding:6px 12px;"><strong>Email:</strong></td><td><a href="mailto:{doc['email']}">{doc['email']}</a></td></tr>
          <tr><td style="padding:6px 12px;"><strong>Teléfono:</strong></td><td>{doc['telefono'] or '—'}</td></tr>
          <tr><td style="padding:6px 12px;"><strong>Mensaje:</strong></td><td>{doc['mensaje'] or '—'}</td></tr>
          <tr><td style="padding:6px 12px;"><strong>IP:</strong></td><td>{doc['ip']}</td></tr>
          <tr><td style="padding:6px 12px;"><strong>Referer:</strong></td><td>{doc['referer'] or '—'}</td></tr>
        </table>
        """
        await svc.send_email(subject, html)
    except Exception as exc:
        logger.warning("Email notification for demo request failed: %s", exc)

    return {
        "success": True,
        "id": doc_id,
        "message": "Solicitud recibida. Nos contactamos en menos de 24 horas.",
    }


@router.get("/licitaciones/")
async def list_public_licitaciones(
    page: int = 1,
    size: int = 20,
    repo: LicitacionRepository = Depends(get_licitacion_repository),
):
    """List all publicly shared licitaciones (no auth)."""
    filters = {"is_public": True}
    skip = (page - 1) * size
    items = await repo.get_all(skip=skip, limit=size, filters=filters)
    total = await repo.count(filters=filters)
    return {
        "items": items,
        "paginacion": {
            "pagina": page,
            "por_pagina": size,
            "total_items": total,
            "total_paginas": (total + size - 1) // size,
        },
    }


@router.get("/licitaciones/{slug}")
async def get_public_licitacion(
    slug: str,
    request: Request,
):
    """Get a single public licitacion by slug (no auth)."""
    db = request.app.mongodb
    doc = await db.licitaciones.find_one({"public_slug": slug, "is_public": True})
    if not doc:
        raise HTTPException(status_code=404, detail="Licitación no encontrada")

    from db.models import licitacion_entity
    return licitacion_entity(doc)
