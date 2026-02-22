from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import logging
import asyncio
from bs4 import BeautifulSoup
from datetime import datetime
import uuid
import sys
from pathlib import Path

# Add parent directory to path so we can import modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
import aiohttp
from scrapers.resilient_http import ResilientHttpClient

logger = logging.getLogger("scraper")

class BaseScraper(ABC):
    """Base class for scrapers"""

    def __init__(self, config: ScraperConfig):
        """Initialize the scraper with a configuration"""
        self.config = config
        self.session = None
        self.http_client: Optional[ResilientHttpClient] = None

    async def setup(self):
        """Set up the scraper with resilient HTTP client"""
        self.http_client = ResilientHttpClient(
            headers=self.config.headers,
            cookies=self.config.cookies,
        )
        # Keep a raw aiohttp session for subclasses that use self.session directly
        timeout = aiohttp.ClientTimeout(total=60, connect=15, sock_read=30)
        self.session = aiohttp.ClientSession(
            headers=self.config.headers,
            cookies=self.config.cookies,
            timeout=timeout,
        )

    async def cleanup(self):
        """Clean up resources"""
        if self.http_client:
            await self.http_client.close()
        if self.session:
            await self.session.close()

    @abstractmethod
    async def extract_licitacion_data(self, html: str, url: str) -> Optional[LicitacionCreate]:
        """Extract licitacion data from HTML"""
        pass

    @abstractmethod
    async def extract_links(self, html: str) -> List[str]:
        """Extract links to licitacion pages"""
        pass

    @abstractmethod
    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        """Get the URL of the next page for pagination"""
        pass

    async def fetch_page(self, url: str) -> Optional[str]:
        """Fetch a page using the resilient HTTP client"""
        if self.http_client:
            return await self.http_client.fetch(url)
        logger.error("HTTP client not initialized - call setup() first")
        return None

    async def process_page(self, url: str) -> List[LicitacionCreate]:
        """Process a page and extract licitaciones"""
        html = await self.fetch_page(url)
        if not html:
            return []

        licitaciones = []

        # If this is a licitacion detail page
        licitacion_data_dict = await self.extract_licitacion_data(html, url)
        if licitacion_data_dict:
            # Add fuente to the licitacion data
            licitacion_data_dict["fuente"] = self.config.name
            licitaciones.append(LicitacionCreate(**licitacion_data_dict))
            return licitaciones

        # If this is a listing page
        links = await self.extract_links(html)
        for link in links:
            detail_html = await self.fetch_page(link)
            if detail_html:
                licitacion_data_dict = await self.extract_licitacion_data(detail_html, link)
                if licitacion_data_dict:
                    # Add fuente to the licitacion data
                    licitacion_data_dict["fuente"] = self.config.name
                    licitaciones.append(LicitacionCreate(**licitacion_data_dict))

            # Stop if we've reached the maximum number of items
            if self.config.max_items and len(licitaciones) >= self.config.max_items:
                break

        return licitaciones

    async def enrich_licitacion(self, lic: Dict[str, Any]) -> Dict[str, Any]:
        """Optional Level 2 enrichment: extract detailed data from a licitacion's source.
        Override in subclasses that support enrichment.
        Returns dict of additional fields to merge into the licitacion."""
        return {}

    async def get_documents(self, lic: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Optional Level 3: download/list documents for a licitacion.
        Override in subclasses that support document retrieval.
        Returns list of document metadata dicts."""
        return []

    # ========================================================================
    # VIGENCIA MODEL: Date Resolution & Estado Computation
    # ========================================================================

    def _resolve_publication_date(
        self,
        parsed_date: Optional[datetime],
        title: str = "",
        description: str = "",
        opening_date: Optional[datetime] = None,
        attached_files: Optional[List[Dict]] = None,
    ) -> Optional[datetime]:
        """
        Resolve publication_date with 7-priority fallback chain.

        Priority:
        1. Use parsed_date (if valid range)
        2. Extract FULL date from title
        3. Extract FULL date from description (first 500 chars)
        4. Extract YEAR from title (source-specific patterns)
        5. Extract YEAR from description
        6. Estimate from opening_date - 30 days (if valid)
        7. Search in attached_files filenames
        8. Return None (NEVER datetime.utcnow())

        Validation:
        - Check 2024 <= year <= 2027
        - Reject if > opening_date (when both exist)
        """
        from utils.dates import (
            extract_date_from_text,
            extract_year_from_text,
            validate_date_range,
            validate_date_order
        )
        from datetime import timedelta

        source_name = self.config.name if self.config else None

        # Priority 1: Use parsed_date if valid
        if parsed_date:
            is_valid, _ = validate_date_range(parsed_date, "publication_date")
            if is_valid:
                # Also check against opening_date
                is_order_valid, _ = validate_date_order(parsed_date, opening_date)
                if is_order_valid:
                    logger.debug(f"[{source_name}] Using parsed publication_date: {parsed_date.date()}")
                    return parsed_date

        # Priority 2: Extract FULL date from title
        if title:
            full_date = extract_date_from_text(title, context="title")
            if full_date:
                is_valid, _ = validate_date_range(full_date, "publication_date")
                is_order_valid, _ = validate_date_order(full_date, opening_date)
                if is_valid and is_order_valid:
                    logger.info(f"[{source_name}] Extracted publication_date from title: {full_date.date()}")
                    return full_date

        # Priority 3: Extract FULL date from description (first 500 chars)
        if description:
            desc_preview = description[:500]
            full_date = extract_date_from_text(desc_preview, context="description")
            if full_date:
                is_valid, _ = validate_date_range(full_date, "publication_date")
                is_order_valid, _ = validate_date_order(full_date, opening_date)
                if is_valid and is_order_valid:
                    logger.info(f"[{source_name}] Extracted publication_date from description: {full_date.date()}")
                    return full_date

        # Priority 4: Extract YEAR from title (source-specific)
        if title:
            year = extract_year_from_text(title, context="title", source_hint=source_name)
            if year:
                # Estimate as Jan 1 of that year
                estimated = datetime(year, 1, 1)
                logger.info(f"[{source_name}] Estimated publication_date from title year: {estimated.date()}")
                return estimated

        # Priority 5: Extract YEAR from description
        if description:
            desc_preview = description[:500]
            year = extract_year_from_text(desc_preview, context="description", source_hint=source_name)
            if year:
                estimated = datetime(year, 1, 1)
                logger.info(f"[{source_name}] Estimated publication_date from description year: {estimated.date()}")
                return estimated

        # Priority 6: Estimate from opening_date - 30 days
        if opening_date:
            is_valid, _ = validate_date_range(opening_date, "opening_date")
            if is_valid:
                estimated = opening_date - timedelta(days=30)
                # Validate estimated date
                is_est_valid, _ = validate_date_range(estimated, "publication_date")
                if is_est_valid:
                    logger.info(f"[{source_name}] Estimated publication_date from opening_date: {estimated.date()}")
                    return estimated

        # Priority 7: Search in attached_files filenames
        if attached_files:
            for file_meta in attached_files:
                filename = file_meta.get("filename", "")
                if filename:
                    full_date = extract_date_from_text(filename, context="filename")
                    if full_date:
                        is_valid, _ = validate_date_range(full_date, "publication_date")
                        if is_valid:
                            logger.info(f"[{source_name}] Extracted publication_date from filename: {full_date.date()}")
                            return full_date

        # Priority 8: Return None (NEVER datetime.utcnow())
        logger.warning(f"[{source_name}] Could not resolve publication_date")
        return None

    def _resolve_opening_date(
        self,
        parsed_date: Optional[datetime],
        title: str = "",
        description: str = "",
        publication_date: Optional[datetime] = None,
        attached_files: Optional[List[Dict]] = None,
    ) -> Optional[datetime]:
        """
        Resolve opening_date with 5-priority fallback chain.

        Priority:
        1. Use parsed_date (if valid range)
        2. Extract from description ("Apertura: DD/MM/YYYY")
        3. Extract YEAR from title/description → estimate (+45 days from pub)
        4. Search in attached_files filenames
        5. Return None (DO NOT estimate from publication_date without year)

        Validation:
        - Check 2024 <= year <= 2027
        - Check >= publication_date (when both exist)
        """
        from utils.dates import (
            extract_date_from_text,
            extract_year_from_text,
            validate_date_range,
            validate_date_order
        )
        from datetime import timedelta

        source_name = self.config.name if self.config else None

        # Priority 1: Use parsed_date if valid
        if parsed_date:
            is_valid, _ = validate_date_range(parsed_date, "opening_date")
            if is_valid:
                # Also check against publication_date
                is_order_valid, _ = validate_date_order(publication_date, parsed_date)
                if is_order_valid:
                    logger.debug(f"[{source_name}] Using parsed opening_date: {parsed_date.date()}")
                    return parsed_date
                else:
                    logger.warning(f"[{source_name}] Parsed opening_date {parsed_date.date()} violates order constraint")

        # Priority 2: Extract from description
        if description:
            # Look for "Apertura:" patterns
            import re
            apertura_match = re.search(
                r"(?:apertura|fecha\s+apertura|acto\s+apertura)[\s:]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
                description[:1000],
                re.IGNORECASE
            )
            if apertura_match:
                date_str = apertura_match.group(1)
                from utils.dates import parse_date_guess
                full_date = parse_date_guess(date_str)
                if full_date:
                    is_valid, _ = validate_date_range(full_date, "opening_date")
                    is_order_valid, _ = validate_date_order(publication_date, full_date)
                    if is_valid and is_order_valid:
                        logger.info(f"[{source_name}] Extracted opening_date from description: {full_date.date()}")
                        return full_date

        # Priority 3: Extract YEAR from title/description, estimate +45 days from publication
        if publication_date:
            year = None
            if title:
                year = extract_year_from_text(title, context="title", source_hint=source_name)
            if not year and description:
                year = extract_year_from_text(description[:500], context="description", source_hint=source_name)

            if year and year == publication_date.year:
                # Same year, estimate +45 days
                estimated = publication_date + timedelta(days=45)
                is_valid, _ = validate_date_range(estimated, "opening_date")
                if is_valid:
                    logger.info(f"[{source_name}] Estimated opening_date from publication_date + 45 days: {estimated.date()}")
                    return estimated

        # Priority 4: Search in attached_files filenames
        if attached_files:
            for file_meta in attached_files:
                filename = file_meta.get("filename", "")
                if filename and "apertura" in filename.lower():
                    full_date = extract_date_from_text(filename, context="filename")
                    if full_date:
                        is_valid, _ = validate_date_range(full_date, "opening_date")
                        is_order_valid, _ = validate_date_order(publication_date, full_date)
                        if is_valid and is_order_valid:
                            logger.info(f"[{source_name}] Extracted opening_date from filename: {full_date.date()}")
                            return full_date

        # Priority 5: Return None
        logger.warning(f"[{source_name}] Could not resolve opening_date")
        return None

    def _compute_estado(
        self,
        publication_date: Optional[datetime],
        opening_date: Optional[datetime],
        fecha_prorroga: Optional[datetime] = None
    ) -> str:
        """
        Compute estado based on dates and today.

        Logic:
        - archivada: publication_date < 2025-01-01
        - prorrogada: opening_date < today AND fecha_prorroga > today
        - vencida: opening_date < today AND NO prórroga
        - vigente: opening_date >= today (or missing)

        Returns: "vigente" | "vencida" | "prorrogada" | "archivada"
        """
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

        # Rule 1: Historical archive
        if publication_date and publication_date < datetime(2025, 1, 1):
            return "archivada"

        # Rule 2: Prórroga
        if fecha_prorroga and fecha_prorroga > today:
            return "prorrogada"

        # Rule 3: Vencida
        if opening_date and opening_date < today:
            return "vencida"

        # Rule 3.5: Old items without opening_date are probably vencida
        # If published >60 days ago and no opening_date, mark as vencida
        if opening_date is None and publication_date:
            days_since_pub = (today - publication_date).days
            if days_since_pub > 45:
                return "vencida"

        # Rule 4: Vigente (default)
        return "vigente"

    async def run(self) -> List[LicitacionCreate]:
        """Run the scraper and extract licitaciones.
        Fetches each page ONCE and reuses the HTML for both item extraction
        and pagination — avoids the previous double-fetch per page."""
        await self.setup()

        try:
            licitaciones = []
            current_url = str(self.config.url)
            page_count = 0

            while current_url:
                page_count += 1
                logger.info(f"Processing page {page_count}: {current_url}")

                # Fetch once — reuse for extraction AND pagination
                html = await self.fetch_page(current_url)
                if not html:
                    break

                # Determine if this is a detail page or a listing page
                licitacion_data_dict = await self.extract_licitacion_data(html, current_url)
                if licitacion_data_dict:
                    licitacion_data_dict["fuente"] = self.config.name
                    licitaciones.append(LicitacionCreate(**licitacion_data_dict))
                else:
                    links = await self.extract_links(html)
                    for link in links:
                        detail_html = await self.fetch_page(link)
                        if detail_html:
                            licitacion_data_dict = await self.extract_licitacion_data(detail_html, link)
                            if licitacion_data_dict:
                                licitacion_data_dict["fuente"] = self.config.name
                                licitaciones.append(LicitacionCreate(**licitacion_data_dict))
                        if self.config.max_items and len(licitaciones) >= self.config.max_items:
                            break

                # Stop if we've reached the maximum number of items
                if self.config.max_items and len(licitaciones) >= self.config.max_items:
                    break

                # Reuse already-fetched HTML for pagination (no second request)
                current_url = await self.get_next_page_url(html, current_url)

            return licitaciones
        finally:
            await self.cleanup()
