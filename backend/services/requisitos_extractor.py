"""RequisitosExtractor — Gemini Flash structured extraction of participation requirements from pliego text.

Extracts a JSON schema with the fields that a company must satisfy to participate in a licitacion.
Used by the match_score_service to compute per-company affinity scores without LLM at score time.
"""
import json
import logging
import os
from typing import Optional

logger = logging.getLogger("requisitos_extractor")

REQUISITOS_SCHEMA = {
    "type": "object",
    "properties": {
        "certificaciones_exigidas": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Certificaciones requeridas (ej: RUPE, ISO 9001, IRAM)",
        },
        "experiencia_minima_anios": {
            "type": "integer",
            "description": "Años mínimos de experiencia del oferente",
        },
        "capacidad_tecnica": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Requisitos técnicos (equipamiento, personal, habilitaciones)",
        },
        "zona_ejecucion": {
            "type": "string",
            "description": "Lugar o zona donde se ejecuta el contrato",
        },
        "garantia_oferta_pct": {
            "type": "number",
            "description": "Porcentaje de garantía de oferta sobre el presupuesto oficial",
        },
        "garantia_contrato_pct": {
            "type": "number",
            "description": "Porcentaje de garantía de cumplimiento de contrato",
        },
        "plazo_entrega_dias": {
            "type": "integer",
            "description": "Plazo de entrega o ejecución en días corridos",
        },
        "admite_oferta_parcial": {
            "type": "boolean",
            "description": "Si el pliego permite cotizar ítems parcialmente",
        },
        "red_flags": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Requisitos excluyentes o condiciones que pueden impedir participar",
        },
    },
}

PROMPT = """Analizá el siguiente texto de un pliego de licitación pública argentina.
Extraé los requisitos que debe cumplir la empresa oferente para poder participar.
Devolvé SOLO JSON válido. Omitir campos si no están mencionados explícitamente en el texto.
No inventes requisitos que no estén en el pliego.

TEXTO DEL PLIEGO:
{texto}
"""


class RequisitosExtractor:
    def __init__(self):
        self._api_key = os.getenv("GEMINI_API_KEY")
        self._model = None

    def _get_model(self):
        if self._model is None:
            if not self._api_key:
                return None
            try:
                import google.generativeai as genai
                genai.configure(api_key=self._api_key)
                self._model = genai.GenerativeModel(
                    "gemini-2.0-flash",
                    generation_config={
                        "response_mime_type": "application/json",
                        "response_schema": REQUISITOS_SCHEMA,
                        "temperature": 0.1,
                    },
                )
            except Exception as e:
                logger.warning(f"Failed to init Gemini model: {e}")
                return None
        return self._model

    async def extract(self, text: str) -> Optional[dict]:
        """Extract structured requirements from pliego text. Returns None if unavailable.

        Tries Gemini first, falls back to Groq (llama-3.3-70b) on quota/rate errors.
        """
        if not text or len(text) < 100:
            return None
        model = self._get_model()
        if model is not None:
            try:
                import asyncio as _asyncio
                response = await _asyncio.to_thread(
                    model.generate_content,
                    PROMPT.format(texto=text[:8000]),
                )
                data = json.loads(response.text)
                if isinstance(data, dict):
                    return data
            except Exception as e:
                logger.warning(f"RequisitosExtractor Gemini failed, trying Groq: {e}")
        return await self._extract_with_groq(text)

    async def _extract_with_groq(self, text: str) -> Optional[dict]:
        """Groq fallback for requisitos extraction."""
        groq_key = os.getenv("GROQ_API_KEY")
        if not groq_key:
            return None
        try:
            from groq import AsyncGroq
            client = AsyncGroq(api_key=groq_key)
            schema_str = json.dumps(REQUISITOS_SCHEMA, ensure_ascii=False, indent=2)
            system = (
                "Sos un extractor de requisitos de licitaciones públicas argentinas. "
                "Respondé SOLO con JSON válido (sin markdown, sin explicaciones) "
                f"siguiendo este schema: {schema_str}"
            )
            resp = await client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": PROMPT.format(texto=text[:8000])},
                ],
                temperature=0.1,
                max_tokens=1200,
            )
            raw = resp.choices[0].message.content or ""
            # Strip markdown code fences if present
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1].lstrip("json").strip()
            data = json.loads(raw)
            if isinstance(data, dict):
                logger.info("RequisitosExtractor: used Groq fallback successfully")
                return data
        except Exception as e:
            logger.warning(f"RequisitosExtractor Groq fallback failed: {e}")
        return None


_instance: Optional[RequisitosExtractor] = None


def get_requisitos_extractor() -> RequisitosExtractor:
    global _instance
    if _instance is None:
        _instance = RequisitosExtractor()
    return _instance
