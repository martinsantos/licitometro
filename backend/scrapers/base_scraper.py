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

    async def run(self) -> List[LicitacionCreate]:
        """Run the scraper and extract licitaciones"""
        await self.setup()

        try:
            licitaciones = []
            current_url = self.config.url
            page_count = 0

            while current_url:
                page_count += 1
                logger.info(f"Processing page {page_count}: {current_url}")

                page_licitaciones = await self.process_page(current_url)
                licitaciones.extend(page_licitaciones)

                # Stop if we've reached the maximum number of items
                if self.config.max_items and len(licitaciones) >= self.config.max_items:
                    break

                # Get the next page
                html = await self.fetch_page(current_url)
                if not html:
                    break

                current_url = await self.get_next_page_url(html, current_url)

            return licitaciones
        finally:
            await self.cleanup()
