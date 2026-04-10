"""
Groq LLM field extraction for missing licitación fields.

Uses Groq free tier (llama-3.3-70b-versatile) as FALLBACK
when regex extraction fails. Extracts: budget, currency,
opening_date, category, objeto from description text.

Requires GROQ_API_KEY in environment.
Falls back silently if key not set or quota exceeded.
"""

import asyncio
import json
import logging
import os
import re
from datetime import datetime
from typing import Any, Dict, Optional

logger = logging.getLogger("groq_field_extractor")

GROQ_MODEL = "llama-3.3-70b-versatile"

PROMPT_EXTRACT_FIELDS = """Sos un experto en licitaciones públicas argentinas. Del siguiente texto de licitación, extraé SOLO los campos que puedas identificar con certeza.

Título: {title}
Objeto: {objeto}
Descripción (primeros 1500 chars):
{description}

Respondé SOLO con JSON válido (sin markdown, sin backticks):
{{"presupuesto": null, "moneda": null, "fecha_apertura": null, "rubro": null, "objeto_sintetizado": null}}

REGLAS:
- Si no encontrás el dato con certeza, dejá null
- presupuesto: número decimal SIN separadores de miles (ej: 1234567.89, NO 1.234.567,89). Solo presupuesto oficial/estimado. Ignorá costos de pliego, garantías, aranceles y sellados.
- moneda: "ARS" o "USD"
- fecha_apertura: formato "YYYY-MM-DD". Solo la fecha de apertura de ofertas/sobres. No confundir con fecha de publicación.
- rubro: una de estas categorías COMPR.AR: ALIMENTOS, COMBUSTIBLES, COMPUTACION, CONSTRUCCION, CONSULTORIA, ELECTRICIDAD, FARMACIA, FERRETERIA, FUMIGACION, IMPRESIONES, INDUMENTARIA, LABORATORIO, LIMPIEZA, MAQUINARIA, MATERIALES, MOBILIARIO, NEUMATICOS, PAPELERIA, PINTURA, REFRIGERACION, REPARACIONES, SEGURIDAD, SEÑALIZACION, SERVICIOS GENERALES, TELECOMUNICACIONES, TEXTILES, TRANSPORTE, VEHICULOS, VIDRIOS
- objeto_sintetizado: resumen del objeto de la contratación en máximo 150 caracteres. Solo si no hay objeto claro arriba."""


class GroqFieldExtractor:
    """Extracts missing licitación fields using Groq LLM as fallback."""

    def __init__(self):
        self._api_key = os.getenv("GROQ_API_KEY")
        self.enabled = bool(self._api_key)
        self._client = None
        self._semaphore = asyncio.Semaphore(1)  # 1 concurrent request
        if not self.enabled:
            logger.info("GroqFieldExtractor disabled (GROQ_API_KEY not set)")

    def _get_client(self):
        if not self.enabled:
            return None
        if self._client is None:
            try:
                from groq import Groq
                self._client = Groq(api_key=self._api_key)
            except ImportError:
                logger.warning("groq package not installed — field extraction disabled")
                self.enabled = False
                return None
        return self._client

    async def extract_missing_fields(
        self,
        title: str,
        description: str,
        objeto: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Extract missing fields from text using Groq LLM.

        Returns dict with keys: budget, currency, opening_date, category, objeto.
        Values are None if not found or extraction failed.
        """
        result = {
            "budget": None,
            "currency": None,
            "opening_date": None,
            "category": None,
            "objeto": None,
        }

        client = self._get_client()
        if client is None:
            return result

        if not description or len(description) < 50:
            return result

        try:
            prompt = PROMPT_EXTRACT_FIELDS.format(
                title=title or "",
                objeto=objeto or "(no disponible)",
                description=(description or "")[:1500],
            )

            async with self._semaphore:
                response = await asyncio.to_thread(
                    client.chat.completions.create,
                    model=GROQ_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=300,
                    temperature=0.05,
                )

            content = response.choices[0].message.content.strip()
            parsed = self._extract_json(content)
            if not parsed:
                return result

            # Validate and extract budget
            raw_budget = parsed.get("presupuesto")
            if raw_budget is not None:
                try:
                    budget = float(raw_budget)
                    # Sanity: budget must be > 1000 and < 100 billion
                    if 1000 < budget < 100_000_000_000:
                        result["budget"] = budget
                        result["currency"] = parsed.get("moneda") or "ARS"
                except (ValueError, TypeError):
                    pass

            # Validate and extract opening_date
            raw_date = parsed.get("fecha_apertura")
            if raw_date:
                try:
                    dt = datetime.strptime(str(raw_date), "%Y-%m-%d")
                    # Sanity: date must be 2024-2028
                    if 2024 <= dt.year <= 2028:
                        result["opening_date"] = dt
                except (ValueError, TypeError):
                    pass

            # Category
            raw_cat = parsed.get("rubro")
            if raw_cat and isinstance(raw_cat, str) and len(raw_cat) > 3:
                result["category"] = raw_cat.upper().strip()

            # Objeto
            raw_obj = parsed.get("objeto_sintetizado")
            if raw_obj and isinstance(raw_obj, str) and len(raw_obj) > 10:
                result["objeto"] = raw_obj[:200].strip()

            return result

        except Exception as e:
            logger.warning(f"Groq field extraction failed: {e}")
            return result

    def _extract_json(self, content: str) -> Optional[dict]:
        """Extract JSON object from LLM response."""
        try:
            start = content.find("{")
            end = content.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(content[start:end])
        except (json.JSONDecodeError, ValueError) as e:
            logger.debug(f"JSON extraction failed: {e}")
        return None


# Singleton
_instance: Optional[GroqFieldExtractor] = None


def get_groq_field_extractor() -> GroqFieldExtractor:
    global _instance
    if _instance is None:
        _instance = GroqFieldExtractor()
    return _instance
