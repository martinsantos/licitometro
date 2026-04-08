"""
OpenDataLoader PDF service — wraps the opendataloader-pdf library for /lab experiments.

opendataloader-pdf is a Java-based PDF parser (Python wrapper) that extracts:
- Headings, paragraphs, lists, tables, images, formulas
- Bounding boxes for each element
- Structured JSON output preserving reading order

Requires Java 11+ at runtime (installed in Dockerfile.prod).
Each convert() call spawns a JVM, so it's slow — ~10-30s per PDF.
"""

import asyncio
import json
import logging
import os
import tempfile
import time
from typing import Any, Dict, Optional

import aiohttp

logger = logging.getLogger("opendataloader_service")

MAX_PDF_BYTES = 50 * 1024 * 1024  # 50 MB


class OpenDataLoaderService:
    """Async wrapper around opendataloader-pdf for /lab experiments."""

    def __init__(self):
        try:
            import opendataloader_pdf  # noqa
            self.enabled = True
        except ImportError:
            self.enabled = False
            logger.warning("opendataloader-pdf not installed")

    async def parse_url(self, url: str, timeout: int = 120) -> Dict[str, Any]:
        """Download a PDF from URL and parse it with opendataloader-pdf."""
        if not self.enabled:
            return {
                "success": False,
                "error": "opendataloader-pdf not installed on server",
                "timing_ms": 0,
            }

        start = time.time()

        # Step 1: Download the PDF
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url, timeout=aiohttp.ClientTimeout(total=30), ssl=False
                ) as resp:
                    if resp.status != 200:
                        return {
                            "success": False,
                            "error": f"HTTP {resp.status} downloading PDF",
                            "timing_ms": int((time.time() - start) * 1000),
                        }
                    content_length = int(resp.headers.get("Content-Length", 0))
                    if content_length > MAX_PDF_BYTES:
                        return {
                            "success": False,
                            "error": f"PDF too large: {content_length / 1024 / 1024:.1f}MB > {MAX_PDF_BYTES / 1024 / 1024:.0f}MB",
                            "timing_ms": int((time.time() - start) * 1000),
                        }
                    pdf_bytes = await resp.read()
                    if len(pdf_bytes) > MAX_PDF_BYTES:
                        return {
                            "success": False,
                            "error": f"PDF too large: {len(pdf_bytes) / 1024 / 1024:.1f}MB",
                            "timing_ms": int((time.time() - start) * 1000),
                        }
        except asyncio.TimeoutError:
            return {
                "success": False,
                "error": "Timeout downloading PDF (30s)",
                "timing_ms": int((time.time() - start) * 1000),
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Download error: {type(e).__name__}: {str(e)[:200]}",
                "timing_ms": int((time.time() - start) * 1000),
            }

        # Step 2: Parse with opendataloader-pdf (in a thread, since it spawns JVM)
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(self._parse_bytes_sync, pdf_bytes),
                timeout=timeout,
            )
            result["timing_ms"] = int((time.time() - start) * 1000)
            result["pdf_size_bytes"] = len(pdf_bytes)
            return result
        except asyncio.TimeoutError:
            return {
                "success": False,
                "error": f"Timeout parsing PDF ({timeout}s) — opendataloader spawns JVM per call",
                "timing_ms": int((time.time() - start) * 1000),
                "pdf_size_bytes": len(pdf_bytes),
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Parse error: {type(e).__name__}: {str(e)[:300]}",
                "timing_ms": int((time.time() - start) * 1000),
                "pdf_size_bytes": len(pdf_bytes),
            }

    def _parse_bytes_sync(self, pdf_bytes: bytes) -> Dict[str, Any]:
        """Synchronous parse — runs in a thread to avoid blocking event loop."""
        import opendataloader_pdf

        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = os.path.join(tmpdir, "input.pdf")
            output_dir = os.path.join(tmpdir, "output")
            os.makedirs(output_dir, exist_ok=True)
            with open(input_path, "wb") as f:
                f.write(pdf_bytes)

            # Call the library — spawns JVM
            opendataloader_pdf.convert(
                input_path=[input_path],
                output_dir=output_dir,
                format="json",
            )

            # Read the output JSON
            json_files = [f for f in os.listdir(output_dir) if f.endswith(".json")]
            if not json_files:
                return {"success": False, "error": "No JSON output produced"}

            with open(os.path.join(output_dir, json_files[0]), encoding="utf-8") as f:
                data = json.load(f)

        return self._build_summary(data)

    def _build_summary(self, data: Any) -> Dict[str, Any]:
        """Build a friendly summary from the raw opendataloader JSON."""
        # The output structure varies — handle both list and dict roots
        elements = []
        if isinstance(data, list):
            elements = data
        elif isinstance(data, dict):
            elements = data.get("elements", []) or data.get("blocks", []) or []
            if not elements and "pages" in data:
                for page in data["pages"]:
                    elements.extend(page.get("elements", []))

        # Count by type
        type_counts: Dict[str, int] = {}
        pages_set = set()
        text_samples = []
        tables = []

        for el in elements:
            if not isinstance(el, dict):
                continue
            etype = el.get("type", "unknown")
            type_counts[etype] = type_counts.get(etype, 0) + 1
            page = el.get("page") or el.get("page_number")
            if page is not None:
                pages_set.add(page)
            content = el.get("content") or el.get("text") or ""
            if etype in ("paragraph", "heading", "title") and content:
                if len(text_samples) < 10:
                    text_samples.append({
                        "type": etype,
                        "page": page,
                        "text": str(content)[:300],
                    })
            elif etype == "table":
                tables.append({
                    "page": page,
                    "preview": str(content)[:500] if content else None,
                })

        return {
            "success": True,
            "summary": {
                "total_elements": len(elements),
                "pages": len(pages_set),
                "type_counts": type_counts,
                "tables_found": len(tables),
            },
            "text_samples": text_samples,
            "tables": tables[:5],
            "raw": data if len(json.dumps(data, default=str)) < 50000 else {"truncated": True, "preview": str(data)[:5000]},
        }
