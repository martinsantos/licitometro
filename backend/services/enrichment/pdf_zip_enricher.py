"""Binary download and PDF/ZIP text extraction for enrichment."""

import io
import logging
import os
import zipfile
from typing import Any, Dict, Optional

from scrapers.resilient_http import ResilientHttpClient
from .text_analyzer import analyze_extracted_text

logger = logging.getLogger("generic_enrichment")

MAX_PDF_BYTES = int(os.environ.get("MAX_PDF_BYTES", 25 * 1024 * 1024))
MAX_ZIP_BYTES = int(os.environ.get("MAX_ZIP_BYTES", 50 * 1024 * 1024))
MAX_PDF_PAGES = int(os.environ.get("MAX_PDF_PAGES", 200))

# Feature flag: use opendataloader-pdf (Java-based, structured) instead of pypdf.
# Falls back to pypdf automatically on failure or if not available.
# Rollback: set USE_OPENDATALOADER_PDF=false in .env and restart backend.
USE_OPENDATALOADER_PDF = os.environ.get("USE_OPENDATALOADER_PDF", "false").lower() == "true"


async def download_binary(http: ResilientHttpClient, url: str, max_bytes: int) -> Optional[bytes]:
    """Stream-download binary content with size limit."""
    try:
        import aiohttp
        from scrapers.resilient_http import PROXY_URL, PROXY_SECRET, PROXIED_DOMAINS
        from urllib.parse import urlparse

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        }
        # Route blocked domains through Cloudflare Worker proxy
        target_url = url
        domain = urlparse(url).netloc.lower()
        if any(domain == d or domain.endswith("." + d) for d in PROXIED_DOMAINS):
            headers["X-Target-URL"] = url
            headers["X-Proxy-Secret"] = PROXY_SECRET
            target_url = PROXY_URL
            logger.info(f"Binary download via proxy: {url[:60]}")

        import asyncio as _asyncio
        use_ssl = False if target_url == url else None  # None = default SSL for workers.dev
        use_proxy = target_url != url

        async with aiohttp.ClientSession(headers=headers) as session:
            max_attempts = 5 if use_proxy else 3
            for attempt in range(max_attempts):
                try:
                    async with session.get(
                        target_url,
                        timeout=aiohttp.ClientTimeout(total=90 if use_proxy else 60),
                        ssl=use_ssl,
                    ) as resp:
                        if resp.status == 522 and attempt < max_attempts - 1:
                            logger.warning(f"Binary proxy 522, retry {attempt + 1}: {url[:60]}")
                            await _asyncio.sleep(3)
                            continue
                        if resp.status != 200:
                            logger.warning(f"Binary download failed ({resp.status}): {url}")
                            return None
                        content_length = int(resp.headers.get("Content-Length", 0))
                        if content_length > max_bytes:
                            logger.warning(f"Binary too large ({content_length / 1024 / 1024:.1f}MB): {url}")
                            return None
                        chunks = []
                        total = 0
                        async for chunk in resp.content.iter_chunked(64 * 1024):
                            total += len(chunk)
                            if total > max_bytes:
                                logger.warning(f"Binary exceeded size limit during download: {url}")
                                return None
                            chunks.append(chunk)
                        return b"".join(chunks)
                except (aiohttp.ClientError, _asyncio.TimeoutError) as e:
                    if attempt < max_attempts - 1:
                        logger.warning(f"Binary download attempt {attempt + 1} failed: {e}, retrying...")
                        await _asyncio.sleep(3)
                        continue
                    raise
            return None
    except Exception as e:
        logger.error(f"Error downloading binary {url}: {e}")
        return None


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes.

    If USE_OPENDATALOADER_PDF is enabled, tries opendataloader-pdf first
    (Java-based, structured output, preserves reading order, ~10-30s/PDF).
    Falls back to pypdf on any failure (~1-3s/PDF, plain text).
    """
    if USE_OPENDATALOADER_PDF:
        try:
            text = _extract_with_opendataloader(pdf_bytes)
            if text and len(text) > 50:
                return text
            logger.info("opendataloader returned empty/short result, falling back to pypdf")
        except Exception as e:
            logger.warning(f"opendataloader extraction failed ({type(e).__name__}: {e}), falling back to pypdf")
    return _extract_with_pypdf(pdf_bytes)


def _extract_with_pypdf(pdf_bytes: bytes) -> str:
    """Original pypdf-based extraction. Page count capped at MAX_PDF_PAGES."""
    from pypdf import PdfReader
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        num_pages = min(len(reader.pages), MAX_PDF_PAGES)
        parts = []
        for i in range(num_pages):
            page_text = reader.pages[i].extract_text()
            if page_text:
                parts.append(page_text)
        if num_pages < len(reader.pages):
            logger.info(f"PDF capped at {num_pages}/{len(reader.pages)} pages")
        return "\n\n".join(parts)
    except Exception as e:
        logger.error(f"pypdf text extraction failed: {e}")
        return ""


def _extract_with_opendataloader(pdf_bytes: bytes) -> str:
    """Use opendataloader-pdf (Java) to extract structured kids[], flatten to text in reading order.

    Headings are prefixed with "## " markers so downstream regex/text analysis
    can detect them better than from pypdf flat output.
    """
    import json
    import tempfile
    try:
        import opendataloader_pdf
    except ImportError:
        raise RuntimeError("opendataloader-pdf not installed")

    with tempfile.TemporaryDirectory() as td:
        input_path = os.path.join(td, "input.pdf")
        output_dir = os.path.join(td, "output")
        os.makedirs(output_dir, exist_ok=True)
        with open(input_path, "wb") as f:
            f.write(pdf_bytes)

        opendataloader_pdf.convert(
            input_path=[input_path],
            output_dir=output_dir,
            format="json",
        )

        json_files = [f for f in os.listdir(output_dir) if f.endswith(".json")]
        if not json_files:
            return ""

        with open(os.path.join(output_dir, json_files[0]), encoding="utf-8") as f:
            data = json.load(f)

    return _flatten_kids_to_text(data)


def _flatten_kids_to_text(data: dict) -> str:
    """Walk the kids[] tree from opendataloader output and concatenate content
    in reading order. Headings get '## ' prefix to preserve structure hints.
    """
    if not isinstance(data, dict):
        return ""

    parts: list = []
    HEADING_TYPES = {"heading", "title", "h1", "h2", "h3", "h4"}

    def walk(el: Any):
        if not isinstance(el, dict):
            return
        etype = (el.get("type") or "").lower()
        content = el.get("content") or el.get("text") or el.get("value") or ""
        if isinstance(content, list):
            content = " ".join(str(c) for c in content if c)
        if content:
            content_str = str(content).strip()
            if content_str:
                if etype in HEADING_TYPES:
                    parts.append("\n## " + content_str + "\n")
                else:
                    parts.append(content_str)
        for child in (el.get("kids") or el.get("children") or []):
            walk(child)

    for kid in data.get("kids", []):
        walk(kid)

    return "\n".join(parts)


async def extract_text_from_pdf_url(http: ResilientHttpClient, url: str) -> Optional[str]:
    """Download a PDF and extract text."""
    data = await download_binary(http, url, MAX_PDF_BYTES)
    if not data:
        return None
    text = extract_text_from_pdf_bytes(data)
    return text if text else None


async def extract_text_from_zip(http: ResilientHttpClient, url: str) -> Optional[str]:
    """Download a ZIP, find PDFs inside, extract text from all."""
    data = await download_binary(http, url, MAX_ZIP_BYTES)
    if not data:
        return None
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
        texts = []
        for name in zf.namelist():
            if name.lower().endswith(".pdf"):
                pdf_bytes = zf.read(name)
                if len(pdf_bytes) <= MAX_PDF_BYTES:
                    text = extract_text_from_pdf_bytes(pdf_bytes)
                    if text:
                        texts.append(text)
        zf.close()
        return "\n\n".join(texts) if texts else None
    except Exception as e:
        logger.error(f"ZIP extraction failed for {url}: {e}")
        return None


async def enrich_from_attached_files(http: ResilientHttpClient, lic_doc: dict) -> Dict[str, Any]:
    """Extract enrichment data from attached PDF/ZIP files."""
    attached = lic_doc.get("attached_files") or []
    if not attached:
        return {}

    for file_obj in attached:
        if not isinstance(file_obj, dict):
            continue
        file_url = file_obj.get("url", "")
        file_type = file_obj.get("type", "").lower()

        if file_type == "pdf":
            text = await extract_text_from_pdf_url(http, file_url)
            if text:
                logger.info(f"Enriched from attached PDF: {file_url[:60]}...")
                return analyze_extracted_text(text, lic_doc)
        elif file_type == "zip":
            text = await extract_text_from_zip(http, file_url)
            if text:
                logger.info(f"Enriched from attached ZIP: {file_url[:60]}...")
                return analyze_extracted_text(text, lic_doc)

    return {}
