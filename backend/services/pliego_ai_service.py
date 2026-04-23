"""
Pliego AI Service — structured summary + Q&A chat over a licitación's pliego.

Uses GroqEnrichmentService (Groq → Cerebras fallback) and falls back to
Gemini OCR (services/ocr_service) for scanned PDFs where pypdf yields nothing.
Caches the structured summary in licitacion.metadata.ia_resumen with a 30d TTL.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import timedelta
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from utils.time import utc_now

logger = logging.getLogger("pliego_ai")

PLIEGO_TEXT_CAP = 60_000      # llama-3.3-70b context budget
RESUMEN_TTL_DAYS = 30
CHAT_RATE_LIMIT_DAILY = 30    # per user


PROMPT_RESUMEN = """Sos un analista de licitaciones públicas argentinas.
Te paso el TEXTO de un pliego de bases y condiciones; tenés que extraer datos clave en JSON.

Texto del pliego:
\"\"\"
{text}
\"\"\"

Devolvé EXCLUSIVAMENTE un JSON con esta estructura (sin texto antes ni después):
{{
  "documentacion_requerida": ["lista corta de documentos exigidos al oferente"],
  "plazo_entrega": "string corto (ej: '30 días corridos desde adjudicación') o 'No se especifica'",
  "lugar_entrega": "string corto",
  "contactos": {{"email": "string vacío si no aparece", "telefono": "string vacío si no aparece"}},
  "garantia_mantenimiento_oferta": "string corto (ej: '5% del presupuesto oficial') o 'No se especifica'",
  "observaciones": "1-2 frases con cualquier requerimiento atípico, restrictivo o llamativo"
}}"""


PROMPT_CHAT_SYS = """Sos un asistente experto en licitaciones públicas argentinas.
Respondés con precisión y brevedad sobre el pliego que te paso como contexto.
- Si la pregunta no se puede responder con el texto del pliego, decilo claramente.
- Citá literalmente cuando sea relevante (entrecomillado).
- Usá pesos argentinos y formato local para fechas.
- Máximo 4 párrafos.
"""


class PliegoAIService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        from services.groq_enrichment import GroqEnrichmentService
        self.llm = GroqEnrichmentService()
        self.llm.db = db  # enable usage tracking

    # ── Pliego text resolution ─────────────────────────────────────────

    async def get_pliego_text(self, licitacion_id: str) -> Dict[str, Any]:
        """Resolve the pliego text for a licitación.

        Priority:
          1. metadata.pliego_local_url → read disk + pypdf
          2. metadata.full_pliego_text (if previously extracted)
          3. metadata.comprar_pliego_text or other cached fields
          4. (fallback) live download from canonical_url if it's a PDF
        Returns {text, source: "local"|"cached"|"live"|"none", filename}
        """
        try:
            oid = licitacion_id if isinstance(licitacion_id, ObjectId) else ObjectId(str(licitacion_id))
        except Exception:
            return {"text": "", "source": "none", "filename": ""}

        lic = await self.db.licitaciones.find_one({"_id": oid})
        if not lic:
            return {"text": "", "source": "none", "filename": ""}

        meta = lic.get("metadata") or {}

        # 1. Local pliego
        local_url = meta.get("pliego_local_url")
        if local_url:
            try:
                from services.pliego_storage_service import read_local_pliego
                pdf_bytes = read_local_pliego(local_url)
                if pdf_bytes:
                    from services.enrichment.pdf_zip_enricher import extract_text_from_pdf_bytes
                    text = extract_text_from_pdf_bytes(pdf_bytes)
                    if text and len(text) > 200:
                        return {
                            "text": text[:PLIEGO_TEXT_CAP],
                            "source": "local",
                            "filename": local_url.rsplit("/", 1)[-1],
                        }
                    # Scanned PDF — try Gemini OCR
                    text = await self._try_gemini_ocr(pdf_bytes)
                    if text:
                        return {
                            "text": text[:PLIEGO_TEXT_CAP],
                            "source": "local_ocr",
                            "filename": local_url.rsplit("/", 1)[-1],
                        }
            except Exception as e:
                logger.warning(f"Local pliego read failed: {e}")

        # 2. Cached extracted text in metadata
        for key in ("full_pliego_text", "pliego_text", "comprar_pliego_text"):
            t = meta.get(key)
            if isinstance(t, str) and len(t) > 200:
                return {"text": t[:PLIEGO_TEXT_CAP], "source": "cached", "filename": key}

        # 3. Description fallback (better than nothing for HTML-only sources)
        desc = lic.get("description") or ""
        if isinstance(desc, str) and len(desc) > 500:
            return {"text": desc[:PLIEGO_TEXT_CAP], "source": "description", "filename": "description"}

        return {"text": "", "source": "none", "filename": ""}

    async def _try_gemini_ocr(self, pdf_bytes: bytes) -> Optional[str]:
        """Best-effort Gemini OCR for scanned PDFs."""
        try:
            from services.ocr_service import get_ocr_service
            svc = get_ocr_service()
            if not getattr(svc, "enabled", False):
                return None
            # ocr_service interface varies; try common shape
            if hasattr(svc, "extract_text_from_pdf_bytes"):
                return await svc.extract_text_from_pdf_bytes(pdf_bytes)
        except Exception as e:
            logger.debug(f"Gemini OCR fallback unavailable: {e}")
        return None

    # ── Resumen estructurado ───────────────────────────────────────────

    async def _find_lic(self, licitacion_id: str):
        """Resolve licitacion by ObjectId or id_licitacion."""
        try:
            oid = ObjectId(str(licitacion_id))
            lic = await self.db.licitaciones.find_one({"_id": oid})
            if lic:
                return lic
        except Exception:
            pass
        return await self.db.licitaciones.find_one({"id_licitacion": licitacion_id})

    async def generate_resumen(self, licitacion_id: str, force_refresh: bool = False) -> Dict[str, Any]:
        """Generate (or return cached) structured summary of the pliego."""
        lic = await self._find_lic(licitacion_id)
        if not lic:
            return {"ok": False, "error": "licitacion not found"}

        meta = lic.get("metadata") or {}
        cached = meta.get("ia_resumen")
        cached_at = meta.get("ia_resumen_at")
        if cached and cached_at and not force_refresh:
            try:
                age = utc_now() - cached_at
                if age < timedelta(days=RESUMEN_TTL_DAYS):
                    return {"ok": True, "resumen": cached, "cached": True, "provider": meta.get("ia_resumen_provider", "unknown")}
            except Exception:
                pass

        oid = lic["_id"]
        pliego = await self.get_pliego_text(str(oid))
        if not pliego["text"]:
            return {"ok": False, "error": "no_pliego_text", "source": pliego["source"]}

        prompt = PROMPT_RESUMEN.format(text=pliego["text"])
        content = await self.llm._call_llm(
            [{"role": "user", "content": prompt}],
            max_tokens=900, temperature=0.1, endpoint="pliego_resumen",
        )
        if not content:
            return {"ok": False, "error": "llm_unavailable"}

        parsed = self.llm._extract_json(content)
        if not parsed:
            return {"ok": False, "error": "llm_unparseable", "raw": content[:500]}

        provider = "groq" if self.llm._get_client() else "cerebras"
        await self.db.licitaciones.update_one(
            {"_id": oid},
            {
                "$set": {
                    "metadata.ia_resumen": parsed,
                    "metadata.ia_resumen_at": utc_now(),
                    "metadata.ia_resumen_provider": provider,
                    "metadata.ia_resumen_source": pliego["source"],
                }
            },
        )
        return {"ok": True, "resumen": parsed, "cached": False, "provider": provider, "source": pliego["source"]}

    # ── Chat Q&A ──────────────────────────────────────────────────────

    async def chat(
        self,
        licitacion_id: str,
        pregunta: str,
        history: Optional[List[Dict[str, str]]] = None,
        user_email: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Ask a free-text question against the pliego with light history.

        Rate-limited per user (counts requests today on ai_usage collection).
        """
        if not pregunta or len(pregunta.strip()) < 3:
            return {"ok": False, "error": "pregunta_vacia"}

        lic = await self._find_lic(licitacion_id)
        if not lic:
            return {"ok": False, "error": "licitacion not found"}
        oid = lic["_id"]

        # Rate limit (best-effort; misses don't block on tracking errors)
        used_today = await self._count_chat_today(user_email)
        if used_today >= CHAT_RATE_LIMIT_DAILY:
            return {"ok": False, "error": "rate_limited", "used": used_today, "limit": CHAT_RATE_LIMIT_DAILY}

        pliego = await self.get_pliego_text(str(oid))
        if not pliego["text"]:
            return {"ok": False, "error": "no_pliego_text"}

        messages = [{"role": "system", "content": PROMPT_CHAT_SYS}]
        messages.append({
            "role": "user",
            "content": f"CONTEXTO (texto del pliego):\n\"\"\"\n{pliego['text']}\n\"\"\"",
        })
        # Last 3 history exchanges only
        for turn in (history or [])[-6:]:
            role = turn.get("role")
            content = turn.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content[:2000]})
        messages.append({"role": "user", "content": pregunta.strip()[:2000]})

        content = await self.llm._call_llm(
            messages, max_tokens=700, temperature=0.2, endpoint=f"pliego_chat:{user_email or 'anon'}",
        )
        if not content:
            return {"ok": False, "error": "llm_unavailable"}

        provider = "groq" if self.llm._get_client() else "cerebras"
        return {
            "ok": True,
            "respuesta": content,
            "provider": provider,
            "source": pliego["source"],
            "used_today": used_today + 1,
            "limit": CHAT_RATE_LIMIT_DAILY,
        }

    async def _count_chat_today(self, user_email: Optional[str]) -> int:
        """Count today's chat calls for this user (or 'anon' bucket)."""
        if user_email is None:
            user_email = "anon"
        try:
            from datetime import datetime as _dt
            today_start = _dt.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            n = await self.db.ai_usage.count_documents({
                "endpoint": {"$regex": f"^pliego_chat:{user_email}"},
                "created_at": {"$gte": today_start},
            })
            return n
        except Exception:
            return 0


_singleton: Optional[PliegoAIService] = None


def get_pliego_ai_service(db: AsyncIOMotorDatabase) -> PliegoAIService:
    global _singleton
    if _singleton is None:
        _singleton = PliegoAIService(db)
    return _singleton
