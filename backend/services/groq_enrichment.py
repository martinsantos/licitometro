"""
GroqEnrichmentService - LLM-powered enrichment using Groq free tier.

Uses llama-3.2-3b-preview model (14,400 req/day free tier).
Requires GROQ_API_KEY in environment.
Falls back silently if key not set or quota exceeded.
"""

import asyncio
import json
import logging
import os
from typing import Any, Dict, List, Optional

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

PROMPT_PROPUESTA = """Eres un consultor experto en licitaciones públicas argentinas. Genera una propuesta técnica para la siguiente licitación:

{context}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{{"metodologia": "Descripción de la metodología de ejecución (3-4 párrafos, español formal)", "plazo": "Plazo estimado de ejecución (ej: 30 días hábiles)", "lugar": "Lugar de entrega/prestación inferido", "notas": "Condiciones especiales o recomendaciones"}}"""

PROMPT_ANALYZE = """Eres un experto en licitaciones públicas argentinas. Analiza esta cotización y evalúa si conviene presentarse:

{context}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{{"precio": {{"score": 75, "color": "green", "detail": "El precio es competitivo..."}}, "metodologia": {{"score": 60, "color": "yellow", "detail": "La metodología..."}}, "empresa": {{"score": 80, "color": "green", "detail": "La empresa..."}}, "cronograma": {{"score": 70, "color": "green", "detail": "El plazo..."}}, "win_probability": 65, "riesgos": [{{"tipo": "Precio", "nivel": "medio", "detalle": "Descripción del riesgo..."}}], "recomendaciones": ["Recomendación 1", "Recomendación 2"], "veredicto": "Recomendado", "resumen": "Explicación breve de si conviene presentarse"}}"""


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


    async def suggest_propuesta(self, context: str) -> Dict[str, Any]:
        """Generate a technical proposal suggestion using AI."""
        client = self._get_client()
        if not client:
            return {"metodologia": "", "plazo": "", "lugar": "", "notas": "", "error": "IA no disponible"}

        try:
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": PROMPT_PROPUESTA.format(context=context)}],
                max_tokens=800,
                temperature=0.3,
            )
            content = response.choices[0].message.content.strip()
            # Extract JSON from response
            start = content.find("{")
            end = content.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(content[start:end])
            return {"metodologia": content, "plazo": "", "lugar": "", "notas": ""}
        except Exception as e:
            logger.warning(f"Groq suggest_propuesta failed: {e}")
            return {"metodologia": "", "plazo": "", "lugar": "", "notas": "", "error": str(e)}

    async def analyze_bid(self, context: str) -> Dict[str, Any]:
        """Run comprehensive AI analysis on a bid."""
        client = self._get_client()
        if not client:
            return {
                "precio": {"score": 0, "color": "red", "detail": "IA no disponible"},
                "metodologia": {"score": 0, "color": "red", "detail": "IA no disponible"},
                "empresa": {"score": 0, "color": "red", "detail": "IA no disponible"},
                "cronograma": {"score": 0, "color": "red", "detail": "IA no disponible"},
                "win_probability": 0,
                "riesgos": [],
                "recomendaciones": ["Configurar GROQ_API_KEY para habilitar análisis IA"],
                "veredicto": "No disponible",
                "resumen": "El servicio de IA no está configurado.",
            }

        try:
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": PROMPT_ANALYZE.format(context=context)}],
                max_tokens=1000,
                temperature=0.3,
            )
            content = response.choices[0].message.content.strip()
            start = content.find("{")
            end = content.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(content[start:end])
            return {"error": "Respuesta IA no válida", "raw": content[:500]}
        except Exception as e:
            logger.warning(f"Groq analyze_bid failed: {e}")
            return {"error": str(e), "veredicto": "Error", "resumen": f"Error en análisis: {e}"}


_groq_service: Optional[GroqEnrichmentService] = None


def get_groq_enrichment_service() -> GroqEnrichmentService:
    global _groq_service
    if _groq_service is None:
        _groq_service = GroqEnrichmentService()
    return _groq_service
