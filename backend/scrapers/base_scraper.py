from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import logging
import aiohttp
import asyncio
from bs4 import BeautifulSoup
from datetime import datetime
import uuid
from ..models.scraper_config import ScraperConfig
from ..models.licitacion import LicitacionCreate

logger = logging.getLogger("scraper")

class BaseScraper(ABC):
    """Base class for scrapers"""
    
    def __init__(self, config: ScraperConfig):
        """Initialize the scraper with a configuration"""
        self.config = config
        self.session = None
    
    async def setup(self):
        """Set up the scraper"""
        self.session = aiohttp.ClientSession(
            headers=self.config.headers,
            cookies=self.config.cookies
        )
    
    async def cleanup(self):
        """Clean up resources"""
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
        """Fetch a page and return its HTML content"""
        try:
            async with self.session.get(url) as response:
                if response.status == 200:
                    return await response.text()
                else:
                    logger.error(f"Failed to fetch {url}: {response.status}")
                    return None
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            return None
    
    async def process_page(self, url: str) -> List[LicitacionCreate]:
        """Process a page and extract licitaciones"""
        html = await self.fetch_page(url)
        if not html:
            return []
        
        licitaciones = []
        
        # If this is a licitacion detail page
        licitacion_data = await self.extract_licitacion_data(html, url)
        if licitacion_data:
            licitaciones.append(licitacion_data)
            return licitaciones
        
        # If this is a listing page
        links = await self.extract_links(html)
        for link in links:
            detail_html = await self.fetch_page(link)
            if detail_html:
                licitacion_data = await self.extract_licitacion_data(detail_html, link)
                if licitacion_data:
                    licitaciones.append(licitacion_data)
            
            # Respect the wait time
            await asyncio.sleep(self.config.wait_time)
            
            # Stop if we've reached the maximum number of items
            if self.config.max_items and len(licitaciones) >= self.config.max_items:
                break
        
        return licitaciones
    
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
                
                # Respect the wait time
                await asyncio.sleep(self.config.wait_time)
            
            return licitaciones
        finally:
            await self.cleanup()
