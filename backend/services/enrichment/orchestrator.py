"""
Generic Enrichment Service - Orchestrates enrichment across all source types.

Delegates to specialized sub-modules:
- comprar_enricher: COMPR.AR label extraction
- html_enricher: CSS selector + regex extraction
- pdf_zip_enricher: Binary PDF/ZIP download + text extraction
- text_analyzer: Budget, dates, objeto, category from plain text
- url_helpers: URL validation, alternative URL finding
"""

import logging
from typing import Any, Dict, Optional

from bs4 import BeautifulSoup

from scrapers.resilient_http import ResilientHttpClient
from utils.time import utc_now

from . import comprar_enricher, html_enricher, pdf_zip_enricher
from .text_analyzer import analyze_extracted_text, enrich_title_only, _ensure_objeto_and_category
from .url_helpers import is_unfetchable_url, find_best_alt_url

logger = logging.getLogger("generic_enrichment")


class GenericEnrichmentService:
    """Fetches a licitacion's source_url and extracts additional data."""

    def __init__(self):
        self.http = ResilientHttpClient()

    async def enrich(self, lic_doc: dict, selectors: Optional[dict] = None) -> Dict[str, Any]:
        """
        Fetch source_url, extract all available data.

        Args:
            lic_doc: The licitacion document from DB
            selectors: Optional CSS selectors from scraper config

        Returns:
            Dict of fields to update (empty if nothing new found)
        """
        source_url = str(lic_doc.get("source_url", "") or "")
        source_urls = lic_doc.get("source_urls") or {}

        # No URL at all -- title-only enrichment
        if not source_url and not source_urls:
            return enrich_title_only(lic_doc)

        # COMPR.AR: VistaPreviaPliegoCiudadano URLs are STABLE and contain rich data.
        if source_url and "qs=" in source_url and (
            "comprar.mendoza.gov.ar" in source_url or "comprar.gob.ar" in source_url
        ):
            return await comprar_enricher.enrich_comprar(self.http, lic_doc, source_url)

        # Unfetchable URLs: list pages, servlets, session-dependent pages.
        if source_url and is_unfetchable_url(source_url):
            logger.debug(f"Unfetchable URL detected, title-only enrichment: {source_url[:80]}")
            return enrich_title_only(lic_doc)

        # Handle binary URLs (PDF/ZIP) before attempting HTML fetch
        if source_url:
            url_lower = source_url.lower().split("?")[0].split("#")[0]
            is_pdf_url = url_lower.endswith(".pdf") or "/verpdf/" in url_lower or "/getpdf/" in url_lower or "/download/pdf" in url_lower

            # BOE-specific: re-segment gazette PDF and extract from matching segment
            fuente = lic_doc.get("fuente", "")
            if "boletin" in fuente.lower() and is_pdf_url:
                from .boe_enricher import enrich_boe
                result = await enrich_boe(self.http, lic_doc, source_url)
                if result:
                    return result
                # Fall through to generic PDF path if BOE enrichment found nothing

            if is_pdf_url:
                text = await pdf_zip_enricher.extract_text_from_pdf_url(self.http, source_url, lic_doc=lic_doc)
                if text:
                    return analyze_extracted_text(text, lic_doc)
            elif url_lower.endswith(".zip"):
                text = await pdf_zip_enricher.extract_text_from_zip(self.http, source_url)
                if text:
                    return analyze_extracted_text(text, lic_doc)

        # Broken proxy URLs -- try real URL first
        if source_url and "localhost:" in source_url and ":8000" not in source_url:
            logger.debug(f"Proxy URL detected: {source_url[:60]}")
            osep_list = source_urls.get("osep_list", "")
            osep_target = (lic_doc.get("metadata") or {}).get("osep_target", "")
            if osep_list and osep_target:
                logger.info(f"OSEP enrichment via postback: {osep_list[:60]}")
                result = await html_enricher.enrich_osep_postback(self.http, lic_doc, osep_list, osep_target)
                if result:
                    return result
            alt_url = find_best_alt_url(source_urls)
            if alt_url:
                source_url = alt_url
                logger.info(f"Using alternative URL: {alt_url[:80]}")
            else:
                return enrich_title_only(lic_doc)

        try:
            html = await self.http.fetch(source_url)
        except Exception as e:
            logger.warning(f"Failed to fetch {source_url}: {e}")
            result = await pdf_zip_enricher.enrich_from_attached_files(self.http, lic_doc)
            if not result:
                result = enrich_title_only(lic_doc)
            return result

        if not html:
            return enrich_title_only(lic_doc)

        # Safety: if fetched content looks like binary PDF
        if html.lstrip()[:5] == "%PDF-":
            logger.info(f"Content-type mismatch: URL returned PDF binary: {source_url[:80]}")
            text = await pdf_zip_enricher.extract_text_from_pdf_url(self.http, source_url)
            if text:
                return analyze_extracted_text(text, lic_doc)
            return enrich_title_only(lic_doc)

        soup = BeautifulSoup(html, "html.parser")
        sel = selectors or {}
        updates: Dict[str, Any] = {}

        # 1. Extract description
        description = html_enricher.extract_description(soup, sel)
        current_desc = lic_doc.get("description", "") or ""
        if description and len(description) > len(current_desc) + 20:
            updates["description"] = description[:10000]

        # 2. Extract opening date (only if missing)
        if not lic_doc.get("opening_date"):
            opening = html_enricher.extract_opening_date(soup, sel)
            if opening:
                updates["opening_date"] = opening

        # 3. Extract document attachments
        attachments = html_enricher.extract_attachments(soup, source_url)
        existing = lic_doc.get("attached_files") or []
        existing_urls = {f.get("url", "") for f in existing if isinstance(f, dict)}
        new_attachments = [a for a in attachments if a["url"] not in existing_urls]
        if new_attachments:
            updates["attached_files"] = existing + new_attachments

        # 4. Extract extra metadata
        extra = html_enricher.extract_extra_metadata(soup, sel)
        if extra:
            current_meta = lic_doc.get("metadata", {}) or {}
            current_meta.update(extra)
            updates["metadata"] = current_meta

        # 5. Promote budget from metadata to top-level field
        merged_meta = updates.get("metadata", lic_doc.get("metadata", {})) or {}
        if merged_meta.get("budget_extracted") and not lic_doc.get("budget"):
            updates["budget"] = merged_meta["budget_extracted"]
            if not lic_doc.get("currency"):
                updates["currency"] = "ARS"
            merged_meta["budget_source"] = "extracted_from_text"
            updates["metadata"] = merged_meta

        # 6-8. Synthesize objeto, improve title, classify category
        _ensure_objeto_and_category(updates, lic_doc)

        from utils.object_extractor import is_poor_title
        current_title = lic_doc.get("title", "")
        if is_poor_title(current_title):
            meta = updates.get("metadata", lic_doc.get("metadata", {})) or {}
            pliego = meta.get("comprar_pliego_fields", {})
            if isinstance(pliego, dict):
                better = pliego.get("Nombre descriptivo del proceso") or pliego.get("Nombre descriptivo de proceso")
                if better and len(better.strip()) > 10:
                    updates["title"] = better.strip()

        # 9. Promote expedient_number from metadata to top-level if missing
        if not lic_doc.get("expedient_number"):
            exp = updates.get("metadata", {}).get("expediente") or (lic_doc.get("metadata") or {}).get("expediente")
            if exp:
                updates["expedient_number"] = exp

        # 10. Check for prorroga
        html_enricher.detect_prorroga(updates, lic_doc)

        # GUARANTEE: Always try objeto+category even if HTML yielded nothing new
        _ensure_objeto_and_category(updates, lic_doc)

        # Always bump enrichment_level if we extracted anything
        if updates:
            updates["enrichment_level"] = max(lic_doc.get("enrichment_level", 1), 2)
            updates["last_enrichment"] = utc_now()
            updates["updated_at"] = utc_now()
            logger.info(f"Generic enrichment found {len(updates)} field updates for {source_url}")

        return updates

    async def close(self):
        """Close HTTP session."""
        if hasattr(self.http, 'close'):
            await self.http.close()
