"""
GroqEnrichmentService - LLM-powered enrichment using Groq free tier.

Uses llama-3.3-70b-versatile model (Groq free tier).
Requires GROQ_API_KEY in environment.
Falls back silently if key not set or quota exceeded.
"""

import asyncio
import json
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger("groq_enrichment")

GROQ_MODEL = "llama-3.3-70b-versatile"

PROMPT_OBJETO = """Dado el siguiente texto de una licitación pública argentina, extrae el objeto principal de la contratación en máximo 150 caracteres. Solo devuelve el texto del objeto, sin explicaciones ni formato adicional.

Texto:
{text}

Objeto:"""

PROMPT_ITEMS = """Dado el siguiente texto de un pliego de licitación pública argentina, extrae los items o renglones que el organismo solicita y que la empresa oferente deberá cotizar. Para cada item devuelve: descripcion, cantidad (número), unidad (u./kg/m/m²/m³/hs/gl/l/tn).

Responde SOLO con JSON válido, array de objetos con campos: descripcion, cantidad, unidad.
Si no hay items claros, responde con [].

Texto:
{text}

JSON:"""

PROMPT_PROPUESTA = """Eres un consultor que redacta propuestas técnicas para empresas que VENDEN servicios al Estado argentino. Redactá la propuesta DESDE EL PUNTO DE VISTA DEL OFERENTE (la empresa que se presenta a licitar), NO del organismo que licita.

Usá primera persona plural: "Proponemos...", "Nuestra metodología...", "Contamos con experiencia en..."
El tono debe ser profesional, persuasivo y orientado a ganar la licitación.

Licitación:
{context}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{{"metodologia": "Propuesta de metodología desde el POV del oferente (3-4 párrafos, español formal, primera persona plural)", "plazo": "Plazo de ejecución que nos comprometemos a cumplir", "lugar": "Lugar de entrega/prestación comprometido", "notas": "Condiciones comerciales que ofrecemos como empresa"}}"""

PROMPT_MARCO_LEGAL = """Eres un experto en contrataciones públicas argentinas. Analiza el siguiente contexto de una licitación y extrae el marco legal completo para que una empresa pueda preparar su oferta correctamente.

Contexto:
{context}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{{"encuadre_legal": "Ley/decreto que encuadra la contratación", "tipo_procedimiento_explicado": "Explicación del tipo de procedimiento y sus implicancias", "requisitos_habilitacion": ["Requisito 1", "Requisito 2"], "documentacion_obligatoria": [{{"documento": "Certificado fiscal", "descripcion": "...", "donde_obtener": "AFIP"}}], "garantias_requeridas": [{{"tipo": "Garantía de oferta", "porcentaje": "5%", "monto_estimado": null, "forma": "Póliza de caución o depósito bancario"}}], "plazos_legales": [{{"concepto": "Mantenimiento de oferta", "plazo": "30 días"}}], "normativa_aplicable": ["Ley 8706 de Mendoza", "Decreto 1000/15"], "guia_paso_a_paso": ["1. Obtener el pliego", "2. Constituir garantía de oferta", "3. Preparar documentación"]}}"""

PROMPT_ANALYZE = """Eres un consultor experto que asesora empresas que se presentan a licitaciones públicas argentinas. Evaluá esta cotización desde la perspectiva del oferente para maximizar sus chances de ganar.

{context}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{{"precio": {{"score": 75, "color": "green", "detail": "Evaluación del precio ofertado vs presupuesto oficial..."}}, "metodologia": {{"score": 60, "color": "yellow", "detail": "Evaluación de la propuesta técnica del oferente..."}}, "empresa": {{"score": 80, "color": "green", "detail": "Evaluación del perfil de la empresa oferente..."}}, "cronograma": {{"score": 70, "color": "green", "detail": "Evaluación del plazo comprometido..."}}, "win_probability": 65, "riesgos": [{{"tipo": "Precio", "nivel": "medio", "detalle": "Riesgo identificado para el oferente..."}}], "recomendaciones": ["Qué debería mejorar el oferente para ganar..."], "veredicto": "Recomendado/No recomendado presentarse", "resumen": "Resumen ejecutivo para el oferente sobre si conviene presentarse y por qué"}}"""


CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions"
CEREBRAS_MODEL = "llama3.1-8b"


class GroqEnrichmentService:
    """LLM enrichment via Groq free tier with Cerebras fallback."""

    def __init__(self):
        self._api_key = os.getenv("GROQ_API_KEY")
        self._cerebras_key = os.getenv("CEREBRAS_API_KEY")
        self.enabled = bool(self._api_key) or bool(self._cerebras_key)
        self._client = None
        if not self.enabled:
            logger.info("LLM enrichment disabled (no GROQ_API_KEY or CEREBRAS_API_KEY)")

    def _get_client(self):
        if not self._api_key:
            return None
        if self._client is None:
            try:
                from groq import Groq
                self._client = Groq(api_key=self._api_key)
            except ImportError:
                logger.warning("groq package not installed")
                return None
        return self._client

    async def _cerebras_completion(self, messages: list, max_tokens: int = 1000, temperature: float = 0.3) -> Optional[str]:
        """Fallback: call Cerebras API directly via HTTP when Groq rate-limited."""
        if not self._cerebras_key:
            return None
        import aiohttp
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    CEREBRAS_API_URL,
                    headers={"Authorization": f"Bearer {self._cerebras_key}", "Content-Type": "application/json"},
                    json={"model": CEREBRAS_MODEL, "messages": messages, "max_tokens": max_tokens, "temperature": temperature},
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        content = data["choices"][0]["message"]["content"].strip()
                        logger.info(f"Cerebras fallback succeeded ({len(content)} chars)")
                        return content
                    else:
                        err = await resp.text()
                        logger.warning(f"Cerebras API returned {resp.status}: {err[:200]}")
                        return None
        except Exception as e:
            logger.warning(f"Cerebras fallback failed: {e}")
            return None

    def _extract_json(self, content: str, expect_array: bool = False):
        """Extract JSON object or array from LLM response text.

        Returns parsed dict/list on success, None on failure.
        """
        try:
            if expect_array:
                start = content.find("[")
                end = content.rfind("]") + 1
            else:
                start = content.find("{")
                end = content.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(content[start:end])
        except (json.JSONDecodeError, ValueError) as e:
            logger.debug(f"JSON extraction failed: {e}")
        return None

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

            items = self._extract_json(content, expect_array=True)
            if items and isinstance(items, list):
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
            result = self._extract_json(content)
            if result and isinstance(result, dict) and "metodologia" in result:
                return result
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
            result = self._extract_json(content)
            if result and isinstance(result, dict) and any(
                k in result for k in ("precio", "win_probability", "veredicto")
            ):
                return result
            return {"error": "Respuesta IA no válida", "raw": content[:500]}
        except Exception as e:
            logger.warning(f"Groq analyze_bid failed: {e}")
            if "rate_limit" in str(e).lower() or "429" in str(e):
                # Try Cerebras
                cerebras_result = await self._cerebras_completion(
                    [{"role": "user", "content": PROMPT_ANALYZE.format(context=context)}], max_tokens=1000
                )
                if cerebras_result:
                    parsed = self._extract_json(cerebras_result)
                    if parsed and isinstance(parsed, dict):
                        return parsed
            return {"error": "Limite de IA alcanzado. Intenta manana.", "veredicto": "No disponible", "resumen": "Cuota de IA agotada por hoy."}

    async def extract_marco_legal(self, context: str) -> Dict[str, Any]:
        """Extract legal framework analysis for bidding preparation."""
        client = self._get_client()
        if not client:
            return {"error": "IA no disponible"}

        try:
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": PROMPT_MARCO_LEGAL.format(context=context)}],
                max_tokens=1200,
                temperature=0.2,
            )
            content = response.choices[0].message.content.strip()
            result = self._extract_json(content)
            if result and isinstance(result, dict):
                return result
            return {"error": "Respuesta IA no válida", "raw": content[:500]}
        except Exception as e:
            logger.warning(f"Groq extract_marco_legal failed: {e}")
            if "rate_limit" in str(e).lower() or "429" in str(e):
                cerebras_result = await self._cerebras_completion(
                    [{"role": "user", "content": PROMPT_MARCO_LEGAL.format(context=context)}], max_tokens=1200, temperature=0.2
                )
                if cerebras_result:
                    parsed = self._extract_json(cerebras_result)
                    if parsed and isinstance(parsed, dict):
                        return parsed
            return {"error": "Limite de IA alcanzado. Intenta manana."}

    async def extract_pliego_info(self, pliego_text: str, known_fields: str = "") -> Dict[str, Any]:
        """Deep extraction of pliego information for bidders."""
        client = self._get_client()
        if not client:
            return {"error": "IA no disponible", "items": [], "info_faltante": []}

        known_section = ""
        if known_fields:
            known_section = f"""
DATOS YA CONFIRMADOS (NO listar como faltantes):
{known_fields}
"""

        prompt = f"""Eres un analista experto en licitaciones públicas argentinas. Analiza EXHAUSTIVAMENTE el siguiente texto y extrae TODA la información relevante para que una empresa pueda armar su cotización (cuadro de precios).

INSTRUCCIONES CRÍTICAS:
1. ITEMS/RENGLONES: Extrae TODOS los items, renglones o rubros que el oferente debe cotizar. Incluye descripción completa, cantidad exacta y unidad. Si el pliego lista subitems o especificaciones técnicas por item, incluirlas en la descripción.
2. REQUISITOS TÉCNICOS: Extrae requisitos técnicos REALES del texto (certificaciones, normas, especificaciones). NO inventes requisitos genéricos.
3. DOCUMENTACIÓN: Lista SOLO la documentación que el pliego EXPLÍCITAMENTE requiere.
4. INFO FALTANTE: Lista ÚNICAMENTE datos que genuinamente NO aparecen en el texto NI en DATOS CONFIRMADOS. Si el pliego es completo, devuelve lista vacía [].
5. TIPO DE DOCUMENTO: Si el texto es un decreto, resolución, o boletín oficial (NO un pliego de licitación), indicá en info_faltante UN SOLO item: "Este documento es un decreto/resolución, no un pliego de licitación. Para cotizar, busque el pliego específico del proceso." NO listes requisitos genéricos como faltantes.
{known_section}
TEXTO DEL PLIEGO:
{pliego_text[:30000]}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{{"items": [{{"descripcion": "Descripción completa del item/renglón", "cantidad": 1, "unidad": "u."}}], "requisitos_tecnicos": ["Requisito extraído del texto"], "documentacion_requerida": ["Doc requerida en el pliego"], "plazo_ejecucion": "Plazo si aparece en el texto", "lugar_entrega": "Lugar si aparece", "garantias": {{"oferta": "5%", "cumplimiento": "10%"}}, "presupuesto_oficial": null, "fecha_apertura": null, "condiciones_especiales": ["Condición especial del pliego"], "info_faltante": ["SOLO datos genuinamente ausentes del pliego"]}}"""

        try:
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2500,
                temperature=0.2,
            )
            content = response.choices[0].message.content.strip()
            result = self._extract_json(content)
            if result and isinstance(result, dict):
                # Normalize items
                if "items" in result:
                    result["items"] = [
                        {
                            "descripcion": str(it.get("descripcion", ""))[:200],
                            "cantidad": float(it.get("cantidad", 1) or 1),
                            "unidad": str(it.get("unidad", "u."))[:20],
                        }
                        for it in result["items"]
                        if isinstance(it, dict) and it.get("descripcion")
                    ][:50]
                return result
            return {"error": "Respuesta IA no válida", "items": [], "info_faltante": []}
        except Exception as e:
            logger.warning(f"Groq extract_pliego_info failed: {e}")
            return {"error": str(e), "items": [], "info_faltante": []}


    async def _cached_call(self, db, prompt: str, max_tokens: int = 800, temperature: float = 0.3) -> Optional[str]:
        """Call Groq with optional DB-backed cache. Returns raw content string."""
        import hashlib
        prompt_hash = hashlib.md5(prompt.encode()).hexdigest()

        # Check cache
        if db is not None:
            try:
                cached = await db.ai_cache.find_one({"prompt_hash": prompt_hash})
                if cached:
                    return cached.get("content")
            except Exception:
                pass

        client = self._get_client()
        if not client:
            return None

        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        content = response.choices[0].message.content.strip()

        # Store in cache
        if db is not None and content:
            try:
                from datetime import datetime, timezone
                await db.ai_cache.update_one(
                    {"prompt_hash": prompt_hash},
                    {"$set": {"prompt_hash": prompt_hash, "content": content, "created_at": datetime.now(timezone.utc)}},
                    upsert=True,
                )
            except Exception:
                pass

        return content

    async def generate_offer_section(self, section_slug: str, context: str) -> str:
        """Generate content for a specific offer section using AI."""
        section_prompts = {
            "introduccion": "Redacta 2 parrafos: presentacion formal respondiendo al llamado. Menciona el organismo y el objeto EXACTO como aparece en los datos. NO inventes expedientes ni numeros que no esten en el contexto.",
            "resumen_ejecutivo": "Redacta 3 puntos breves: 1) experiencia en proyectos similares (menciona SOLO los que aparecen en ANTECEDENTES VINCULADOS), 2) capacidad tecnica del equipo, 3) compromiso con el plazo. Maximo 150 palabras.",
            "comprension_alcance": "Basandote EXCLUSIVAMENTE en la DESCRIPCION DE LA LICITACION y TEXTO DEL PLIEGO, describí que entendemos que se necesita y que funcionalidades proponemos. Si no hay texto del pliego, indica que se completa segun pliego especifico. Maximo 250 palabras.",
            "propuesta_tecnica": "Describí la solucion tecnica propuesta basandote en la METODOLOGIA PROPUESTA del contexto. Stack tecnologico, componentes, integraciones. Maximo 250 palabras. NO inventes tecnologias que no esten mencionadas.",
            "plan_trabajo": "Basandote en el PLAZO PROPUESTO del contexto, estructura en 3-4 etapas:\nEtapa 1: [Nombre] (Dias 1-X)\n- Actividades\n- Entregables\nUsa el plazo REAL del contexto, no inventes plazos.",
        }

        base_prompt = section_prompts.get(section_slug)
        if not base_prompt:
            # For custom/unknown sections, use the context to generate relevant content
            slug_label = section_slug.replace("_", " ").title()
            base_prompt = f"Redacta la seccion '{slug_label}' basandote en los datos del CONTEXTO. Extraé la informacion relevante del pliego y la descripcion. Si hay texto del pliego, usalo para dar detalles concretos (requisitos, plazos, condiciones). Maximo 250 palabras."

        full_prompt = f"""Redactas ofertas tecnicas para licitaciones publicas argentinas.

REGLAS OBLIGATORIAS:
1. USA datos del CONTEXTO como base. Extraé requisitos, plazos y condiciones del pliego.
2. NUNCA inventes nombres de proyectos, clientes, organismos, fechas ni montos que no esten en el contexto.
3. NUNCA menciones precios, presupuestos ni montos en secciones que no sean la oferta economica.
4. Cuando hay TEXTO DEL PLIEGO, usalo para dar detalles concretos y especificos.
5. Maximo 3 oraciones por parrafo. Sin frases de relleno.
6. Texto plano. Sin markdown. Sin emojis.

TAREA: {base_prompt}

CONTEXTO (UNICA fuente de verdad):
{context[:5000]}"""

        messages = [{"role": "user", "content": full_prompt}]

        # Try Groq first, then Cerebras fallback
        client = self._get_client()
        if client:
            try:
                response = await asyncio.to_thread(
                    client.chat.completions.create,
                    model=GROQ_MODEL,
                    messages=messages,
                    max_tokens=800,
                    temperature=0.15,
                )
                return response.choices[0].message.content.strip()
            except Exception as e:
                err_str = str(e)
                logger.warning(f"Groq failed for {section_slug}: {err_str[:100]}")
                if "rate_limit" in err_str.lower() or "429" in err_str:
                    logger.info("Groq rate-limited, trying Cerebras fallback...")

        # Fallback to Cerebras (same conservative params)
        cerebras_result = await self._cerebras_completion(messages, max_tokens=800, temperature=0.15)
        if cerebras_result:
            return cerebras_result

        return "[Limite de IA alcanzado. Completa esta seccion manualmente o intenta manana.]"


_groq_service: Optional[GroqEnrichmentService] = None


def get_groq_enrichment_service() -> GroqEnrichmentService:
    global _groq_service
    if _groq_service is None:
        _groq_service = GroqEnrichmentService()
    return _groq_service
