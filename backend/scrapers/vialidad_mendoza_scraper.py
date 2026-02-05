"""
Vialidad Provincial de Mendoza Scraper.

Fuentes:
- https://www.mendoza.gov.ar/vialidad/
- Sección de licitaciones y pliegos
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

logger = logging.getLogger("scraper.vialidad_mendoza")


class VialidadMendozaScraper(BaseScraper):
    """Scraper for Vialidad Provincial de Mendoza"""
    
    def __init__(self, config: ScraperConfig):
        super().__init__(config)
    
    async def extract_licitacion_data(self, html: str, url: str) -> Optional[LicitacionCreate]:
        """Extract licitacion data from detail page"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # Find title
            title = None
            for selector in ['h1', 'h2', '.entry-title', '.titulo', '.title']:
                elem = soup.select_one(selector)
                if elem:
                    title = elem.get_text(strip=True)
                    if title and len(title) > 5:
                        break
            
            if not title:
                title = "Licitación Vialidad Mendoza"
            
            # Extract details from content
            details = {}
            
            # Look for paragraphs with labels
            for p in soup.find_all('p'):
                text = p.get_text(strip=True)
                if ':' in text:
                    parts = text.split(':', 1)
                    if len(parts) == 2:
                        key = parts[0].strip().lower()
                        value = parts[1].strip()
                        details[key] = value
            
            # Look for table rows
            for row in soup.find_all('tr'):
                cells = row.find_all(['td', 'th'])
                if len(cells) >= 2:
                    key = cells[0].get_text(strip=True).lower()
                    value = cells[1].get_text(strip=True)
                    details[key] = value
            
            # Extract fields
            expedient_number = (details.get('expediente') or 
                              details.get('n° de expediente') or
                              details.get('número de expediente'))
            
            licitacion_number = (details.get('n° de licitación') or
                               details.get('número de licitación') or
                               details.get('código') or
                               details.get('n° de proceso'))
            
            description = (details.get('objeto') or
                         details.get('descripción') or
                         details.get('obra') or
                         details.get('trabajo') or
                         details.get('detalle'))
            
            # Parse dates
            publication_date = None
            opening_date = None
            
            for key, value in details.items():
                if any(k in key for k in ['fecha de publicación', 'publicación']):
                    publication_date = parse_date_guess(value)
                elif any(k in key for k in ['fecha de apertura', 'apertura', 'fecha de recepción']):
                    opening_date = parse_date_guess(value)
            
            if not publication_date:
                publication_date = datetime.utcnow()
            
            # Extract attached files
            attached_files = []
            for a in soup.find_all('a', href=True):
                href = a.get('href', '')
                text = a.get_text(strip=True)
                
                if any(ext in href.lower() for ext in ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip']):
                    file_url = urljoin(url, href)
                    attached_files.append({
                        "name": text or file_url.split('/')[-1],
                        "url": file_url,
                        "type": href.split('.')[-1].lower() if '.' in href else "unknown"
                    })
            
            # Compute content hash
            content_hash = hashlib.md5(
                f"{title.lower().strip()}|vialidad|{publication_date.strftime('%Y%m%d')}".encode()
            ).hexdigest()
            
            lic = LicitacionCreate(
                title=title,
                organization="Vialidad Provincial de Mendoza",
                publication_date=publication_date,
                opening_date=opening_date,
                expedient_number=expedient_number,
                licitacion_number=licitacion_number,
                description=description,
                contact=details.get('contacto') or details.get('consultas') or details.get('lugar de presentación'),
                source_url=url,
                canonical_url=url,
                source_urls={"vialidad_detail": url},
                url_quality="direct",
                content_hash=content_hash,
                status="active",
                location="Mendoza",
                attached_files=attached_files,
                id_licitacion=licitacion_number or expedient_number or str(uuid.uuid4()),
                jurisdiccion="Mendoza",
                tipo_procedimiento=details.get('tipo') or "Licitación Pública",
                tipo_acceso="Portal Web",
                fecha_scraping=datetime.utcnow(),
                fuente="Vialidad Mendoza",
                metadata={"vialidad_details": details}
            )
            
            return lic
            
        except Exception as e:
            logger.error(f"Error extracting licitacion data from {url}: {e}")
            return None
    
    async def extract_links(self, html: str) -> List[str]:
        """Extract links to licitacion detail pages"""
        soup = BeautifulSoup(html, 'html.parser')
        links = []
        base_url = str(self.config.url)
        
        # Look for links containing licitacion-related keywords
        keywords = ['licitacion', 'licitación', 'pliego', 'concurso', 'convocatoria', 
                   'obra', 'trabajo', 'servicio']
        
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            text = a.get_text(strip=True).lower()
            
            # Check if link text or URL contains keywords
            if any(kw in href.lower() or kw in text for kw in keywords):
                full_url = urljoin(base_url, href)
                if full_url not in links:
                    links.append(full_url)
        
        return links
    
    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        """Get URL of next page"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Look for next page link
        next_link = soup.find('a', text=re.compile(r'siguiente|next|>', re.I))
        if next_link and next_link.get('href'):
            return urljoin(current_url, next_link['href'])
        
        # Look for pagination
        pagination = soup.find('div', class_=re.compile('pagination|paginacion|pager', re.I))
        if pagination:
            current = pagination.find('span', class_=re.compile('current|active', re.I))
            if current:
                try:
                    current_num = int(current.get_text(strip=True))
                    next_page = pagination.find('a', text=str(current_num + 1))
                    if next_page and next_page.get('href'):
                        return urljoin(current_url, next_page['href'])
                except ValueError:
                    pass
        
        return None
    
    async def run(self) -> List[LicitacionCreate]:
        """Run the Vialidad Mendoza scraper"""
        await self.setup()
        
        try:
            licitaciones: List[LicitacionCreate] = []
            
            start_url = str(self.config.url)
            logger.info(f"Starting Vialidad Mendoza scraper from: {start_url}")
            
            current_url = start_url
            page_count = 0
            max_pages = self.config.pagination.get('max_pages', 3) if self.config.pagination else 3
            
            while current_url and page_count < max_pages:
                logger.info(f"Fetching page {page_count + 1}: {current_url}")
                html = await self.fetch_page(current_url)
                
                if not html:
                    break
                
                # Extract links
                links = await self.extract_links(html)
                logger.info(f"Found {len(links)} links on page {page_count + 1}")
                
                # Process each link
                for link in links:
                    if self.config.max_items and len(licitaciones) >= self.config.max_items:
                        break
                    
                    detail_html = await self.fetch_page(link)
                    if detail_html:
                        lic = await self.extract_licitacion_data(detail_html, link)
                        if lic:
                            licitaciones.append(lic)
                            logger.info(f"Extracted: {lic.title[:50]}...")
                    
                    await asyncio.sleep(self.config.wait_time)
                
                if self.config.max_items and len(licitaciones) >= self.config.max_items:
                    break
                
                next_url = await self.get_next_page_url(html, current_url)
                if not next_url or next_url == current_url:
                    break
                
                current_url = next_url
                page_count += 1
            
            logger.info(f"Vialidad Mendoza scraper complete. Found {len(licitaciones)} licitaciones")
            return licitaciones
            
        finally:
            await self.cleanup()
