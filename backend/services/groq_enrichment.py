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
        self.db = None  # Set by caller for AI usage tracking
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
                        tokens_used = data.get("usage", {}).get("total_tokens", 0)
                        logger.info(f"Cerebras fallback succeeded ({len(content)} chars)")
                        # Track usage
                        if self.db is not None:
                            from services.ai_tracker import track_ai_call
                            await track_ai_call(self.db, "cerebras", CEREBRAS_MODEL, tokens_used, "cerebras_fallback")
                        return content
                    else:
                        err = await resp.text()
                        logger.warning(f"Cerebras API returned {resp.status}: {err[:200]}")
                        return None
        except Exception as e:
            logger.warning(f"Cerebras fallback failed: {e}")
            return None

    async def _call_llm(self, messages: list, max_tokens: int = 800, temperature: float = 0.3, endpoint: str = "unknown") -> Optional[str]:
        """Call LLM with automatic Groq → Cerebras fallback. Tracks usage."""
        # Try Groq first
        client = self._get_client()
        if client:
            try:
                response = await asyncio.to_thread(
                    client.chat.completions.create,
                    model=GROQ_MODEL,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                content = response.choices[0].message.content.strip()
                tokens_used = getattr(response.usage, "total_tokens", 0) if hasattr(response, "usage") else 0
                if self.db is not None:
                    try:
                        from services.ai_tracker import track_ai_call
                        await track_ai_call(self.db, "groq", GROQ_MODEL, tokens_used, endpoint)
                    except Exception:
                        pass
                return content
            except Exception as e:
                err_str = str(e)
                logger.warning(f"Groq failed for {endpoint}: {err_str[:100]}")
                if self.db is not None:
                    try:
                        from services.ai_tracker import track_ai_call
                        await track_ai_call(self.db, "groq", GROQ_MODEL, 0, f"rate_limited:{endpoint}")
                    except Exception:
                        pass

        # Fallback to Cerebras
        result = await self._cerebras_completion(messages, max_tokens=max_tokens, temperature=temperature)
        if result:
            return result

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
        """Extract objeto from title + description using LLM."""
        try:
            text = f"{title}\n{description[:1000]}"
            prompt = PROMPT_OBJETO.format(text=text)
            result = await self._call_llm(
                [{"role": "user", "content": prompt}],
                max_tokens=100, temperature=0.1, endpoint="extract_objeto",
            )
            if result:
                result = result.strip('"\'').strip()
                if len(result) > 5:
                    return result[:200]
            return None
        except Exception as e:
            logger.warning(f"Groq extract_objeto failed (will use fallback): {e}")
            return None

    async def extract_items_from_pliego(self, pliego_text: str) -> List[dict]:
        """Extract bid items from pliego text using LLM."""
        try:
            text = pliego_text[:3000]
            prompt = PROMPT_ITEMS.format(text=text)
            content = await self._call_llm(
                [{"role": "user", "content": prompt}],
                max_tokens=500, temperature=0.1, endpoint="extract_items",
            )
            if not content:
                return []
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
        """Generate a technical proposal suggestion using LLM."""
        try:
            content = await self._call_llm(
                [{"role": "user", "content": PROMPT_PROPUESTA.format(context=context)}],
                max_tokens=800, temperature=0.3, endpoint="suggest_propuesta",
            )
            if not content:
                return {"metodologia": "", "plazo": "", "lugar": "", "notas": "", "error": "IA no disponible"}
            result = self._extract_json(content)
            if result and isinstance(result, dict) and "metodologia" in result:
                return result
            return {"metodologia": content, "plazo": "", "lugar": "", "notas": ""}
        except Exception as e:
            logger.warning(f"suggest_propuesta failed: {e}")
            return {"metodologia": "", "plazo": "", "lugar": "", "notas": "", "error": str(e)}

    async def analyze_bid(self, context: str) -> Dict[str, Any]:
        """Run comprehensive AI analysis on a bid (Groq → Cerebras fallback)."""
        content = await self._call_llm(
            [{"role": "user", "content": PROMPT_ANALYZE.format(context=context)}],
            max_tokens=1000, temperature=0.3, endpoint="analyze_bid",
        )
        if not content:
            return {"error": "IA no disponible", "veredicto": "No disponible", "resumen": "Cuota de IA agotada."}
        result = self._extract_json(content)
        if result and isinstance(result, dict) and any(k in result for k in ("precio", "win_probability", "veredicto")):
            return result
        return {"error": "Respuesta IA no valida", "raw": content[:500]}

    async def extract_marco_legal(self, context: str) -> Dict[str, Any]:
        """Extract legal framework analysis (Groq → Cerebras fallback)."""
        content = await self._call_llm(
            [{"role": "user", "content": PROMPT_MARCO_LEGAL.format(context=context)}],
            max_tokens=1200, temperature=0.2, endpoint="extract_marco_legal",
        )
        if not content:
            return {"error": "IA no disponible"}
        result = self._extract_json(content)
        if result and isinstance(result, dict):
            return result
        return {"error": "Respuesta IA no valida", "raw": content[:500]}

    async def extract_pliego_info(self, pliego_text: str, known_fields: str = "") -> Dict[str, Any]:
        """Deep extraction of pliego information (Groq → Cerebras fallback)."""
        known_section = ""
        if known_fields:
            known_section = f"\nDATOS YA CONFIRMADOS (NO listar como faltantes):\n{known_fields}\n"

        prompt = f"""Eres un analista experto en licitaciones públicas argentinas. Analiza EXHAUSTIVAMENTE el siguiente texto y extrae TODA la información relevante para que una empresa pueda armar su cotización (cuadro de precios).

INSTRUCCIONES CRÍTICAS:
1. ITEMS/RENGLONES: Extrae TODOS los items, renglones o rubros que el oferente debe cotizar. Incluye descripción completa, cantidad exacta y unidad.
2. REQUISITOS TÉCNICOS: Extrae requisitos técnicos REALES del texto. NO inventes requisitos genéricos.
3. DOCUMENTACIÓN: Lista SOLO la documentación que el pliego EXPLÍCITAMENTE requiere.
4. INFO FALTANTE: Lista ÚNICAMENTE datos que genuinamente NO aparecen en el texto. Si el pliego es completo, devuelve lista vacía [].
5. TIPO DE DOCUMENTO: Si es un decreto/resolución (NO un pliego), indicá en info_faltante: "Este documento es un resumen de datos, no un pliego de licitación. Para cotizar, busque el pliego específico del proceso."
{known_section}
TEXTO DEL PLIEGO:
{pliego_text[:30000]}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{{"items": [{{"descripcion": "Descripción completa", "cantidad": 1, "unidad": "u."}}], "requisitos_tecnicos": ["Requisito del texto"], "documentacion_requerida": ["Doc requerida"], "plazo_ejecucion": "Plazo si aparece", "lugar_entrega": "Lugar si aparece", "garantias": {{"oferta": "5%", "cumplimiento": "10%"}}, "presupuesto_oficial": null, "fecha_apertura": null, "condiciones_especiales": ["Condición especial"], "info_faltante": ["SOLO datos ausentes"]}}"""

        content = await self._call_llm(
            [{"role": "user", "content": prompt}],
            max_tokens=2500, temperature=0.2, endpoint="extract_pliego_info",
        )
        if not content:
            return {"error": "IA no disponible", "items": [], "info_faltante": []}
        result = self._extract_json(content)
        if result and isinstance(result, dict):
            if "items" in result:
                result["items"] = [
                    {"descripcion": str(it.get("descripcion", ""))[:200], "cantidad": float(it.get("cantidad", 1) or 1), "unidad": str(it.get("unidad", "u."))[:20]}
                    for it in result["items"] if isinstance(it, dict) and it.get("descripcion")
                ][:50]
            return result
        return {"error": "Respuesta IA no valida", "items": [], "info_faltante": []}


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
        tokens_used = getattr(response.usage, "total_tokens", 0) if hasattr(response, "usage") else 0

        # Track AI usage
        if db is not None:
            from services.ai_tracker import track_ai_call
            await track_ai_call(db, "groq", GROQ_MODEL, tokens_used, "cached_call")

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
        """Generate content for a specific offer section using AI.

        Follows McKinsey-level structure: Context → Propuesta concreta → Justificación → Entregable.
        """
        section_prompts = {
            "introduccion": """Redacta 2 parrafos con esta estructura:
PARRAFO 1 (Gancho contextual + propuesta de valor):
- Abri con una referencia concreta al organismo y su contexto (que hace, que desafios tiene).
- Presenta a la empresa con datos concretos: años de experiencia, cantidad de proyectos, areas de expertise.
- Conecta las capacidades con el objeto EXACTO de la licitacion.
PARRAFO 2 (Alineacion especifica):
- Menciona las competencias tecnicas que pide el pliego (del TEXTO DEL PLIEGO si existe).
- Describe brevemente el approach propuesto (no generico).
- Cierra con compromiso de cumplimiento.
REGLA: No uses frases vacias como 'estamos comprometidos a colaborar'. Usa voz activa: 'entregaremos', 'implementaremos', 'garantizamos'. Maximo 200 palabras.""",

            "resumen_ejecutivo": """Redacta 3 diferenciadores concretos como elevator pitch de 1 pagina:
1) EXPERTISE DEMOSTRADO: Menciona proyectos de ANTECEDENTES VINCULADOS con resultados medibles. Si no hay antecedentes directos, reencuadra los existentes destacando componentes relevantes para ESTA licitacion.
2) STACK TECNICO ALINEADO: Enumera las competencias que pide el pliego y muestra como el equipo las cubre con tecnologias especificas (no genericas).
3) METODOLOGIA DE ENTREGA: Describe el approach concreto: sprints, entregables, validaciones con el cliente.
REGLA: Cada punto debe contener datos concretos, no promesas vagas. Maximo 200 palabras.""",

            "comprension_alcance": """Estructura en 3 bloques:
1) REFORMULACION DEL PROBLEMA (en palabras propias, NO copiar el pliego):
- Que necesita el organismo, que desafios enfrenta, que datos/sistemas/procesos estan involucrados.
2) DESAFIOS IMPLICITOS (los que el pliego no dice pero un experto detecta):
- Heterogeneidad de fuentes, frecuencias de actualizacion, integracion con sistemas existentes, etc.
3) ALCANCE PROPUESTO:
- Que se incluye, que entregables tangibles recibira el organismo en cada etapa.
USA el TEXTO DEL PLIEGO para extraer requisitos especificos. Maximo 300 palabras.""",

            "propuesta_tecnica": """Estructura en bloques tecnicos concretos:
1) SOLUCION PROPUESTA: Que se va a construir/implementar. Componentes especificos con nombres de tecnologias reales.
2) ARQUITECTURA: Describir capas, flujo de datos, puntos de integracion. Ser especifico con el stack.
3) JUSTIFICACION TECNICA: Por que esta solucion es la mejor para ESTE caso. Referenciar experiencia o estandares.
USA la METODOLOGIA PROPUESTA del contexto como base. Si el pliego menciona tecnologias especificas, incluirlas.
NO uses tecnologias genericas ('herramientas de visualizacion'). Usa nombres concretos ('Metabase', 'PowerBI', 'Grafana').
Maximo 300 palabras.""",

            "plan_trabajo": """Estructura en etapas con entregables TANGIBLES:
Etapa 1: [Nombre descriptivo] (Dias X-Y)
- Actividades concretas (no 'analisis', sino 'relevamiento de N fuentes de datos')
- Entregable: [documento/sistema/pipeline concreto que recibe el cliente]
- Hito de validacion: [punto donde el cliente revisa y aprueba]

REGLAS:
- Usa el PLAZO PROPUESTO del contexto. Si dice 12 semanas, las etapas deben sumar 12 semanas.
- Minimo 3, maximo 5 etapas.
- Entregables tangibles: no 'informe de progreso', sino 'Pipeline funcional procesando datos de 3 fuentes'.
- Granularidad proporcional al plazo: proyecto de 1 mes = etapas semanales, proyecto de 3 meses = etapas quincenales.""",

            "evaluacion_riesgos": """Identifica 3-4 riesgos ESPECIFICOS de ESTE proyecto (no genericos).
Para cada riesgo:
- Descripcion concreta del riesgo en el contexto del proyecto
- Probabilidad: Alta/Media/Baja
- Impacto: Alto/Medio/Bajo
- Estrategia de mitigacion concreta (que accion se toma)
Ejemplo de riesgo especifico: 'Incompatibilidad entre el formato de datos del sistema X y la base de datos propuesta, probabilidad Media, impacto Alto, mitigacion: prueba de integracion en semana 2 con datos reales.'
NO uses riesgos genericos como 'falta de informacion' o 'incumplimiento de plazos'. Maximo 250 palabras.""",
        }

        base_prompt = section_prompts.get(section_slug)
        if not base_prompt:
            slug_label = section_slug.replace("_", " ").title()
            base_prompt = f"""Redacta la seccion '{slug_label}' con esta estructura:
1) CONTEXTO: 1-2 oraciones conectando la seccion con el problema del cliente.
2) PROPUESTA CONCRETA: Que va a hacer la empresa. Con tecnologias, metodologias y herramientas especificas.
3) JUSTIFICACION: Por que esta solucion es la mejor. Referenciar experiencia o estandares.
4) ENTREGABLE: Que recibe el cliente como resultado.
USA el TEXTO DEL PLIEGO si existe. Maximo 250 palabras."""

        full_prompt = f"""Sos un consultor senior que redacta ofertas tecnicas de nivel McKinsey para licitaciones publicas argentinas.

REGLAS DE REDACCION PROFESIONAL:
1. ESPECIFICIDAD sobre generalidad: No 'herramientas de visualizacion', si 'Metabase/PowerBI'. No 'experiencia en programacion', si 'dominio de Python (pandas, numpy, airflow)'.
2. VOZ ACTIVA Y ASERTIVA: No 'estamos comprometidos a trabajar de manera eficiente'. Si 'entregaremos el dashboard funcional en la semana 6'.
3. ENTREGABLES TANGIBLES: No 'informe de progreso'. Si 'Pipeline funcional procesando datos de 3 fuentes en ambiente de prueba'.
4. NO PARAFRASEAR EL PLIEGO: Si una frase solo repite lo que dice el pliego, reemplazala con tu interpretacion experta.
5. NO REPETIR CONCEPTOS: Cada idea aparece UNA sola vez en todo el documento.
6. NUNCA inventes proyectos, clientes, organismos, fechas ni montos que no esten en el contexto.
7. NUNCA menciones precios ni presupuestos fuera de la oferta economica.
8. NUNCA REPITAS EL TITULO DE LA SECCION: La primera linea NO debe repetir ni parafrasear el titulo. Arranca directo con contenido sustancial.
9. USA SUBTITULOS: Organiza secciones largas con ## Subtitulo para crear jerarquia visual.
10. USA **negrita** para datos clave, cifras, nombres de entregables y conceptos tecnicos. Maximo 3 oraciones por parrafo.

TAREA: {base_prompt}

CONTEXTO (UNICA fuente de verdad):
{context[:6000]}"""

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
                content = response.choices[0].message.content.strip()
                tokens_used = getattr(response.usage, "total_tokens", 0) if hasattr(response, "usage") else 0
                # Track usage
                if self.db is not None:
                    try:
                        from services.ai_tracker import track_ai_call
                        await track_ai_call(self.db, "groq", GROQ_MODEL, tokens_used, f"generate_section:{section_slug}")
                    except Exception as te:
                        logger.debug(f"AI tracking failed: {te}")
                return content
            except Exception as e:
                err_str = str(e)
                logger.warning(f"Groq failed for {section_slug}: {err_str[:100]}")
                # Track failed/rate-limited calls
                if self.db is not None:
                    try:
                        from services.ai_tracker import track_ai_call
                        status = "rate_limited" if ("rate_limit" in err_str.lower() or "429" in err_str) else "error"
                        await track_ai_call(self.db, "groq", GROQ_MODEL, 0, f"{status}:{section_slug}")
                    except Exception:
                        pass
                if "rate_limit" in err_str.lower() or "429" in err_str:
                    logger.info("Groq rate-limited, trying Cerebras fallback...")

        # Fallback to Cerebras (same conservative params)
        cerebras_result = await self._cerebras_completion(messages, max_tokens=800, temperature=0.15)
        if cerebras_result:
            return cerebras_result

        return "[Groq y Cerebras no disponibles. Completa esta seccion manualmente.]"


_groq_service: Optional[GroqEnrichmentService] = None


def get_groq_enrichment_service(db=None) -> GroqEnrichmentService:
    global _groq_service
    if _groq_service is None:
        _groq_service = GroqEnrichmentService()
    if db is not None:
        _groq_service.db = db
    return _groq_service
