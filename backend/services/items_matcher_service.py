"""ItemsMatcher — Extracts line items from pliego text and matches against company catalog.

Two-step:
1. Gemini Flash extracts structured items list from pliego text (descripcion + cantidad + unidad)
2. For each item, MongoDB $text search against catalogo_productos returns top-3 matches
"""
import asyncio
import json
import logging
import os
from typing import Optional

from db.models import catalogo_entity

logger = logging.getLogger("items_matcher")

ITEMS_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "descripcion": {"type": "string", "description": "Descripción del ítem solicitado"},
            "cantidad": {"type": "number", "description": "Cantidad solicitada"},
            "unidad_medida": {"type": "string", "description": "Unidad de medida (UN, M2, KG, etc.)"},
        },
        "required": ["descripcion"],
    },
}

PROMPT = """Sos un asistente especializado en licitaciones públicas argentinas.
Extraé todos los ítems/rubros/posiciones que el organismo está solicitando cotizar.
Para cada ítem: descripción clara, cantidad y unidad de medida si están indicadas.
Devolvé SOLO un JSON array. Máximo 50 ítems. Si el texto no tiene ítems claros, devolvé [].

TEXTO:
{texto}
"""


class ItemsMatcherService:
    def __init__(self):
        self._api_key = os.getenv("GEMINI_API_KEY")
        self._model = None

    def _get_model(self):
        if self._model is None and self._api_key:
            try:
                import google.generativeai as genai
                genai.configure(api_key=self._api_key)
                self._model = genai.GenerativeModel(
                    "gemini-2.0-flash",
                    generation_config={
                        "response_mime_type": "application/json",
                        "response_schema": ITEMS_SCHEMA,
                        "temperature": 0.1,
                    },
                )
            except Exception as e:
                logger.warning(f"Gemini init failed: {e}")
        return self._model

    async def extract_items(self, pliego_text: str) -> list:
        """Extract line items from pliego text via Gemini. Returns list of dicts."""
        if not pliego_text or len(pliego_text) < 50:
            return []
        model = self._get_model()
        if model is None:
            return []
        try:
            response = await asyncio.to_thread(
                model.generate_content,
                PROMPT.format(texto=pliego_text[:8000]),
            )
            data = json.loads(response.text)
            if isinstance(data, list):
                return data[:50]
            return []
        except Exception as e:
            logger.warning(f"extract_items failed: {e}")
            return []

    async def match_items(self, items: list, empresa_id: str, db) -> list:
        """For each pliego item, find top-3 catalog matches via text search."""
        results = []
        for item in items[:30]:
            desc = str(item.get("descripcion", ""))[:200]
            if not desc:
                continue
            matches = await db.catalogo_productos.find(
                {"empresa_id": empresa_id, "$text": {"$search": desc}},
                {"score": {"$meta": "textScore"}},
            ).sort([("score", {"$meta": "textScore"})]).limit(3).to_list(length=3)

            results.append({
                "item": item,
                "matches": [catalogo_entity(m) for m in matches],
            })
        return results

    async def run(self, pliego_text: str, empresa_id: str, db) -> dict:
        """Full pipeline: extract items then match each to catalog."""
        items = await self.extract_items(pliego_text)
        if not items:
            return {"items": [], "matched": 0}
        matched = await self.match_items(items, empresa_id, db)
        return {"items": matched, "matched": len([r for r in matched if r["matches"]])}


_instance: Optional[ItemsMatcherService] = None


def get_items_matcher() -> ItemsMatcherService:
    global _instance
    if _instance is None:
        _instance = ItemsMatcherService()
    return _instance
