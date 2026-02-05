"""
AYSAM (Aguas Mendocinas) Scraper.

Fuentes:
- https://www.aysam.com.ar/pliegosdigitales/licitaciones/
"""

from typing import List, Dict, Any, Optional
import asyncio
import logging
import hashlib
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from datetime import datetime
import re
import uuid
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper
from utils.dates import parse_date_guess

logger = logging.getLogger("scraper.aysam")


class AysamScraper(BaseScraper):
    """Scraper for AYSAM (Aguas Mendocinas)"""
    
    BASE_URL = "https://www.aysam.com.ar"
    LICITACIONES_URL = "https://www.aysam.com.ar/pliegosdigitales/licitaciones/"
    
    def __init__(self, config: ScraperConfig):
        super().__init__(config)
    
    async def extract_licitacion_data(self, html: str, url: str) -> Optional[LicitacionCreate]:
        """Extract licitacion data from detail page"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # AYSAM typically has a table with licitacion details
            # Try to extract title
            title_elem = soup.find('h1') or soup.find('h2') or soup.find('h3')
            title = title_elem.get_text(strip=True) if title_elem else "Licitación AYSAM"
            
            # Look for table with details
            details = {}
            for row in soup.find_all('tr'):
                cells = row.find_all(['td', 'th'])
                if len(cells) >= 2:
                    key = cells[0].get_text(strip=True).lower()
                    value = cells[1].get_text(strip=True)
                    details[key] = value
            
            # Extract common fields
            expedient_number = details.get('n° de expediente') or details.get('expediente')
            licitacion_number = details.get('n° de licitación') or details.get('licitación')
            description = details.get('objeto') or details.get('descripción') or details.get('alcance')
            
            # Parse dates
            publication_date = None
            opening_date = None
            
            for key, value in details.items():
                if 'fecha de' in key and 'apertura' in key:
                    opening_date = parse_date_guess(value)
                elif 'publicación' in key or 'fecha de publicación' in key:
                    publication_date = parse_date_guess(value)
            
            if not publication_date:
                publication_date = datetime.utcnow()
            
            # Extract attached files
            attached_files = []
            for a in soup.find_all('a', href=True):
                href = a.get('href', '')
                text = a.get_text(strip=True)
                
                # Look for document links
                if any(ext in href.lower() for ext in ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip']):
                    file_url = urljoin(url, href)
                    attached_files.append({
                        "name": text or file_url.split('/')[-1],
                        "url": file_url,
                        "type": href.split('.')[-1].lower() if '.' in href else "unknown"
                    })
            
            # Compute content hash
            content_hash = hashlib.md5(
                f"{title.lower().strip()}|aysam|{publication_date.strftime('%Y%m%d')}".encode()
            ).hexdigest()
            
            # Build source_urls
            source_urls = {"aysam_detail": url}
            
            lic = LicitacionCreate(
                title=title,
                organization="AYSAM - Aguas Mendocinas",
                publication_date=publication_date,
                opening_date=opening_date,
                expedient_number=expedient_number,
                licitacion_number=licitacion_number,
                description=description,
                contact=None,
                source_url=url,
                canonical_url=url,
                source_urls=source_urls,
                url_quality="direct",
                content_hash=content_hash,
                status="active",
                location="Mendoza",
                attached_files=attached_files,
                id_licitacion=licitacion_number or expedient_number or str(uuid.uuid4()),
                jurisdiccion="Mendoza",
                tipo_procedimiento="Licitación Pública",
                tipo_acceso="Portal Web",
                fecha_scraping=datetime.utcnow(),
                fuente="AYSAM",
                metadata={"aysam_details": details}
            )
            
            return lic
            
        except Exception as e:
            logger.error(f"Error extracting licitacion data from {url}: {e}")
            return None
    
    async def extract_links(self, html: str) -> List[str]:
        """Extract links to licitacion detail pages from listing"""
        soup = BeautifulSoup(html, 'html.parser')
        links = []
        
        # Look for links to licitacion details
        # Common patterns in AYSAM
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            text = a.get_text(strip=True).lower()
            
            # Look for links containing "licitacion", "pliego", "concurso"
            if any(keyword in href.lower() or keyword in text for keyword in 
                   ['licitacion', 'licitación', 'pliego', 'concurso', 'convocatoria']):
                
                full_url = urljoin(self.BASE_URL, href)
                if full_url not in links:
                    links.append(full_url)
        
        return links
    
    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        """Get URL of next page if exists"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Look for pagination
        next_link = soup.find('a', text=re.compile(r'siguiente|next|>', re.I))
        if next_link and next_link.get('href'):
            return urljoin(current_url, next_link['href'])
        
        # Alternative: look for page numbers
        pagination = soup.find('div', class_=re.compile('pagination|paginacion', re.I))
        if pagination:
            current = pagination.find('span', class_=re.compile('current|active', re.I))
            if current:
                # Try to find next number
                try:
                    current_num = int(current.get_text(strip=True))
                    next_page = pagination.find('a', text=str(current_num + 1))
                    if next_page and next_page.get('href'):
                        return urljoin(current_url, next_page['href'])
                except ValueError:
                    pass
        
        return None
    
    async def run(self) -> List[LicitacionCreate]:
        """Run the AYSAM scraper"""
        await self.setup()
        
        try:
            licitaciones: List[LicitacionCreate] = []
            
            # Fetch main listing page
            logger.info(f"Fetching AYSAM licitaciones from {self.LICITACIONES_URL}")
            html = await self.fetch_page(self.LICITACIONES_URL)
            
            if not html:
                logger.error("Failed to fetch AYSAM listing page")
                return []
            
            # Extract links to detail pages
            links = await self.extract_links(html)
            logger.info(f"Found {len(links)} potential licitacion links")
            
            # Process each link
            for link in links[:self.config.max_items or 100]:
                detail_html = await self.fetch_page(link)
                if detail_html:
                    lic = await self.extract_licitacion_data(detail_html, link)
                    if lic:
                        licitaciones.append(lic)
                        logger.info(f"Extracted: {lic.title[:50]}...")
                
                await asyncio.sleep(self.config.wait_time)
            
            # Check for pagination
            current_url = self.LICITACIONES_URL
            page_count = 1
            max_pages = self.config.pagination.get('max_pages', 1) if self.config.pagination else 1
            
            while page_count < max_pages:
                next_url = await self.get_next_page_url(html, current_url)
                if not next_url or next_url == current_url:
                    break
                
                html = await self.fetch_page(next_url)
                if not html:
                    break
                
                links = await self.extract_links(html)
                for link in links[:self.config.max_items or 100]:
                    if len(licitaciones) >= (self.config.max_items or 1000):
                        break
                    
                    detail_html = await self.fetch_page(link)
                    if detail_html:
                        lic = await self.extract_licitacion_data(detail_html, link)
                        if lic:
                            licitaciones.append(lic)
                    
                    await asyncio.sleep(self.config.wait_time)
                
                current_url = next_url
                page_count += 1
            
            logger.info(f"AYSAM scraper complete. Found {len(licitaciones)} licitaciones")
            return licitaciones
            
        finally:
            await self.cleanup()
