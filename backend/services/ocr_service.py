"""
OCR Service — Gemini 2.5 Flash vision para procesar documentos escaneados.

Soporta: JPEG, PNG, PDF escaneado (convierte páginas a imágenes).
Extrae: tipo_doc, numero_licitacion, organismo, objeto, oferentes, monto_adjudicado, fechas.
Guarda en colección MongoDB 'pileta_documentos'.
"""
from __future__ import annotations

import base64
import io
import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger("ocr_service")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

_EXTRACT_PROMPT = """Eres un experto en licitaciones públicas argentinas. Analiza este documento y extrae toda la información disponible.

Retorna SOLO un JSON válido con esta estructura (omite campos que no encuentres):
{
  "tipo_doc": "acta_apertura|pliego|presupuesto_oficial|contrato|circular|adjudicacion|otro",
  "numero_licitacion": "ej: LP 001/2025",
  "numero_expediente": "ej: EX-2025-001",
  "organismo": "nombre del organismo convocante",
  "objeto": "descripción del objeto licitado",
  "monto_presupuesto_oficial": 0.0,
  "fecha_apertura": "YYYY-MM-DD",
  "fecha_adjudicacion": "YYYY-MM-DD",
  "adjudicatario": "nombre del adjudicatario",
  "monto_adjudicado": 0.0,
  "oferentes": [
    {"nombre": "...", "cuit": "...", "monto": 0.0}
  ],
  "observaciones": "notas adicionales relevantes"
}"""


class OCRService:
    def __init__(self):
        self.enabled = bool(GEMINI_API_KEY)
        if not self.enabled:
            logger.warning("GEMINI_API_KEY not set — OCR service disabled")

    async def process_image(self, image_bytes: bytes, mime_type: str = "image/jpeg") -> Dict[str, Any]:
        """Enviar imagen a Gemini Flash con visión y extraer datos estructurados."""
        if not self.enabled:
            return {"error": "GEMINI_API_KEY not configured", "success": False}

        import aiohttp

        b64 = base64.b64encode(image_bytes).decode()
        payload = {
            "contents": [{
                "parts": [
                    {"text": _EXTRACT_PROMPT},
                    {"inline_data": {"mime_type": mime_type, "data": b64}},
                ]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
            },
        }

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                    if resp.status != 200:
                        text = await resp.text()
                        return {"error": f"Gemini {resp.status}: {text[:200]}", "success": False}
                    result = await resp.json()
                    raw_text = result["candidates"][0]["content"]["parts"][0]["text"]
                    datos = json.loads(raw_text)
                    return {"success": True, "datos": datos}
        except json.JSONDecodeError as e:
            return {"error": f"JSON parse error: {e}", "success": False, "raw": raw_text if 'raw_text' in dir() else ""}
        except Exception as e:
            logger.error(f"OCR process_image error: {e}")
            return {"error": str(e), "success": False}

    async def process_pdf_scanned(self, pdf_bytes: bytes) -> Dict[str, Any]:
        """PDF escaneado: convertir primera página a imagen → OCR."""
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            # Intentar extraer texto primero (PDF con texto seleccionable)
            text_parts = []
            for i, page in enumerate(reader.pages[:5]):
                t = page.extract_text()
                if t:
                    text_parts.append(t)
            if text_parts and len("".join(text_parts)) > 200:
                # PDF con texto — usar análisis de texto directo
                return await self._analyze_text_with_gemini("\n\n".join(text_parts))
        except Exception:
            pass

        # PDF escaneado — renderizar páginas como imágenes
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            page = doc[0]
            mat = fitz.Matrix(2, 2)  # 2x zoom para mejor calidad OCR
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("jpeg")
            return await self.process_image(img_bytes, "image/jpeg")
        except ImportError:
            return {"error": "PyMuPDF (fitz) not installed — needed for PDF scanning", "success": False}
        except Exception as e:
            return {"error": f"PDF render error: {e}", "success": False}

    async def _analyze_text_with_gemini(self, text: str) -> Dict[str, Any]:
        """Analizar texto plano con Gemini (para PDFs con texto seleccionable)."""
        import aiohttp

        prompt = f"{_EXTRACT_PROMPT}\n\nTexto del documento:\n{text[:8000]}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
        }
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status != 200:
                        return {"error": f"Gemini {resp.status}", "success": False}
                    result = await resp.json()
                    raw = result["candidates"][0]["content"]["parts"][0]["text"]
                    datos = json.loads(raw)
                    return {"success": True, "datos": datos}
        except Exception as e:
            return {"error": str(e), "success": False}

    async def ingest(
        self,
        db,
        file_bytes: bytes,
        filename: str,
        mime_type: str,
        pileta: str,
        fuente: str,
        metadata: Optional[Dict] = None,
    ) -> Optional[str]:
        """
        Procesar archivo con OCR y guardar en pileta_documentos.
        Retorna el _id del documento insertado (como string), o None si falla.
        """
        if pileta not in ("publica", "privada"):
            pileta = "privada"

        # Detectar tipo y procesar
        if mime_type == "application/pdf" or filename.lower().endswith(".pdf"):
            ocr_result = await self.process_pdf_scanned(file_bytes)
        else:
            ocr_result = await self.process_image(file_bytes, mime_type)

        datos = ocr_result.get("datos", {}) if ocr_result.get("success") else {}
        error = ocr_result.get("error")

        # Construir texto completo para búsqueda
        texto_parts: List[str] = []
        for field in ["objeto", "organismo", "numero_licitacion", "adjudicatario", "observaciones"]:
            if datos.get(field):
                texto_parts.append(str(datos[field]))
        if isinstance(datos.get("oferentes"), list):
            for o in datos["oferentes"]:
                if isinstance(o, dict) and o.get("nombre"):
                    texto_parts.append(o["nombre"])

        doc = {
            "pileta": pileta,
            "tipo_doc": datos.get("tipo_doc", "otro"),
            "filename": filename,
            "fuente": fuente,
            "datos": datos,
            "texto": " | ".join(texto_parts),
            "ocr_success": ocr_result.get("success", False),
            "ocr_error": error,
            "licitacion_ref": None,
            "metadata": metadata or {},
            "created_at": datetime.utcnow(),
        }

        result = await db.pileta_documentos.insert_one(doc)
        doc_id = str(result.inserted_id)
        logger.info(f"OCR ingest: {filename} → pileta={pileta}, tipo={doc['tipo_doc']}, id={doc_id}")
        return doc_id


# Singleton
_ocr_service: Optional[OCRService] = None


def get_ocr_service() -> OCRService:
    global _ocr_service
    if _ocr_service is None:
        _ocr_service = OCRService()
    return _ocr_service
