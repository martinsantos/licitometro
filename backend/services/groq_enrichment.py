"""
GroqEnrichmentService - LLM-powered enrichment using Groq free tier.

Uses llama-3.2-3b-preview model (14,400 req/day free tier).
Requires GROQ_API_KEY in environment.
Falls back silently if key not set or quota exceeded.
"""

import asyncio
import logging
import os
from typing import List, Optional

logger = logging.getLogger("groq_enrichment")

GROQ_MODEL = "llama-3.2-3b-preview"

PROMPT_OBJETO = """Dado el siguiente texto de una licitación pública argentina, extrae el objeto principal de la contratación en máximo 150 caracteres. Solo devuelve el texto del objeto, sin explicaciones ni formato adicional.

Texto:
{text}

Objeto:"""

PROMPT_ITEMS = """Dado el siguiente texto de un pliego de licitación pública argentina, extrae los items o renglones solicitados. Para cada item devuelve: descripcion, cantidad (número), unidad (u./kg/m/m²/m³/hs/gl/l/tn).

Responde SOLO con JSON válido, array de objetos con campos: descripcion, cantidad, unidad.
Si no hay items claros, responde con [].

Texto:
{text}

JSON:"""


class GroqEnrichmentService:
    """LLM enrichment via Groq free tier."""

    def __init__(self):
        self._api_key = os.getenv("GROQ_API_KEY")
        self.enabled = bool(self._api_key)
        self._client = None
        if not self.enabled:
            logger.info("Groq enrichment disabled (GROQ_API_KEY not set)")

    def _get_client(self):
        if not self.enabled:
            return None
        if self._client is None:
            try:
                from groq import Groq
                self._client = Groq(api_key=self._api_key)
            except ImportError:
                logger.warning("groq package not installed — LLM enrichment disabled")
                self.enabled = False
                return None
        return self._client

    async def extract_objeto(self, title: str, description: str) -> Optional[str]:
        """Extract objeto from title + description using Groq LLM.

        Returns None on error or if Groq is not configured.
        """
        client = self._get_client()
        if client is None:
            return None

        try:
            text = f"{title}\n{description[:1000]}"
            prompt = PROMPT_OBJETO.format(text=text)

            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=100,
                temperature=0.1,
            )
            result = response.choices[0].message.content.strip()
            # Clean up any artifacts
            result = result.strip('"\'').strip()
            if result and len(result) > 5:
                return result[:200]
            return None
        except Exception as e:
            logger.warning(f"Groq extract_objeto failed (will use fallback): {e}")
            return None

    async def extract_items_from_pliego(self, pliego_text: str) -> List[dict]:
        """Extract bid items from pliego text using Groq LLM.

        Returns list of {descripcion, cantidad, unidad} dicts.
        Returns empty list on error.
        """
        client = self._get_client()
        if client is None:
            return []

        try:
            import json
            text = pliego_text[:3000]  # Limit to avoid token overflow
            prompt = PROMPT_ITEMS.format(text=text)

            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=500,
                temperature=0.1,
            )
            content = response.choices[0].message.content.strip()

            # Extract JSON from response
            start = content.find("[")
            end = content.rfind("]") + 1
            if start >= 0 and end > start:
                items_json = content[start:end]
                items = json.loads(items_json)
                # Validate and normalize
                result = []
                for item in items:
                    if isinstance(item, dict) and item.get("descripcion"):
                        result.append({
                            "descripcion": str(item.get("descripcion", ""))[:200],
                            "cantidad": float(item.get("cantidad", 1) or 1),
                            "unidad": str(item.get("unidad", "u."))[:20],
                        })
                return result[:50]  # Max 50 items
            return []
        except Exception as e:
            logger.warning(f"Groq extract_items_from_pliego failed: {e}")
            return []


_groq_service: Optional[GroqEnrichmentService] = None


def get_groq_enrichment_service() -> GroqEnrichmentService:
    global _groq_service
    if _groq_service is None:
        _groq_service = GroqEnrichmentService()
    return _groq_service
