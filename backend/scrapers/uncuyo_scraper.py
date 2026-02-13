"""
UNCuyo (Universidad Nacional de Cuyo) Scraper.

Fuentes:
- https://licitaciones.uncuyo.edu.ar/
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

logger = logging.getLogger("scraper.uncuyo")


class UncuyoScraper(BaseScraper):
    """Scraper for UNCuyo (Universidad Nacional de Cuyo)"""
    
    BASE_URL = "https://licitaciones.uncuyo.edu.ar"
    
    def __init__(self, config: ScraperConfig):
        super().__init__(config)
    
    async def extract_licitacion_data(self, html: str, url: str) -> Optional[LicitacionCreate]:
        """Extract licitacion data from detail page"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # Try to find title
            title_selectors = ['h1', 'h2', '.titulo', '.title', '#titulo']
            title = None
            for selector in title_selectors:
                elem = soup.select_one(selector)
                if elem:
                    title = elem.get_text(strip=True)
                    if title and len(title) > 10:
                        break
            
            if not title:
                title = "Licitación UNCuyo"
            
            # Look for details table or definition list
            details = {}
            
            # Try definition list
            for dt in soup.find_all('dt'):
                dd = dt.find_next_sibling('dd')
                if dd:
                    key = dt.get_text(strip=True).lower()
                    value = dd.get_text(strip=True)
                    details[key] = value
            
            # Try table rows
            for row in soup.find_all('tr'):
                cells = row.find_all(['td', 'th'])
                if len(cells) >= 2:
                    key = cells[0].get_text(strip=True).lower()
                    value = cells[1].get_text(strip=True)
                    details[key] = value
            
            # Extract fields
            expedient_number = (details.get('expediente') or 
                              details.get('n° expediente') or 
                              details.get('número de expediente'))
            
            licitacion_number = (details.get('n° licitación') or 
                                details.get('número de licitación') or
                                details.get('código') or
                                details.get('n° de proceso'))
            
            description = (details.get('objeto') or 
                         details.get('descripción') or 
                         details.get('alcance') or
                         details.get('detalle'))
            
            # Parse dates from details
            pub_date_parsed = None
            opening_date_parsed = None

            for key, value in details.items():
                if 'fecha de publicación' in key or 'publicación' in key:
                    pub_date_parsed = parse_date_guess(value)
                elif 'fecha de apertura' in key or 'apertura' in key:
                    opening_date_parsed = parse_date_guess(value)
                elif 'fecha de cierre' in key or 'cierre' in key:
                    # Could be expiration date
                    pass

            # Extract attached files
            attached_files = []
            for a in soup.find_all('a', href=True):
                href = a.get('href', '')
                text = a.get_text(strip=True)

                if any(ext in href.lower() for ext in ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar']):
                    file_url = urljoin(url, href)
                    attached_files.append({
                        "name": text or file_url.split('/')[-1],
                        "url": file_url,
                        "type": href.split('.')[-1].lower() if '.' in href else "unknown",
                        "filename": file_url.split('/')[-1]
                    })
            
            # Determine organization from details
            organization = "Universidad Nacional de Cuyo"
            for key, value in details.items():
                if 'dependencia' in key or 'unidad' in key or 'facultad' in key:
                    if value:
                        organization = f"UNCuyo - {value}"
                        break

            # VIGENCIA MODEL: Resolve dates with multi-source fallback
            publication_date = self._resolve_publication_date(
                parsed_date=pub_date_parsed,
                title=title,
                description=description or "",
                opening_date=opening_date_parsed,
                attached_files=attached_files
            )

            opening_date = self._resolve_opening_date(
                parsed_date=opening_date_parsed,
                title=title,
                description=description or "",
                publication_date=publication_date,
                attached_files=attached_files
            )

            # Compute content hash (handle None publication_date)
            content_hash = hashlib.md5(
                f"{title.lower().strip()}|uncuyo|{publication_date.strftime('%Y%m%d') if publication_date else 'unknown'}".encode()
            ).hexdigest()

            # Compute estado
            estado = self._compute_estado(publication_date, opening_date, fecha_prorroga=None)

            lic = LicitacionCreate(
                title=title,
                organization=organization,
                publication_date=publication_date,
                opening_date=opening_date,
                expedient_number=expedient_number,
                licitacion_number=licitacion_number,
                description=description,
                contact=details.get('contacto') or details.get('consultas'),
                source_url=url,
                canonical_url=url,
                source_urls={"uncuyo_detail": url},
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
                fuente="UNCuyo",
                estado=estado,
                fecha_prorroga=None,
                metadata={"uncuyo_details": details}
            )
            
            return lic
            
        except Exception as e:
            logger.error(f"Error extracting licitacion data from {url}: {e}")
            return None
    
    async def extract_links(self, html: str) -> List[str]:
        """Extract links to licitacion detail pages"""
        soup = BeautifulSoup(html, 'html.parser')
        links = []
        
        # Look for links in tables (common in UNCuyo)
        for table in soup.find_all('table'):
            for a in table.find_all('a', href=True):
                href = a.get('href', '')
                text = a.get_text(strip=True).lower()
                
                # Look for links to licitacion details
                if any(keyword in href.lower() or keyword in text for keyword in 
                       ['licitacion', 'licitación', 'concurso', 'pliego', 'detalle', 'ver']):
                    full_url = urljoin(self.BASE_URL, href)
                    if full_url not in links:
                        links.append(full_url)
        
        # Also look for article or div links
        for elem in soup.find_all(['article', 'div'], class_=re.compile('licitacion|item|entry', re.I)):
            a = elem.find('a', href=True)
            if a:
                href = a.get('href', '')
                full_url = urljoin(self.BASE_URL, href)
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
        """Run the UNCuyo scraper"""
        await self.setup()
        
        try:
            licitaciones: List[LicitacionCreate] = []
            
            # Get starting URL from config
            start_url = str(self.config.url)
            logger.info(f"Starting UNCuyo scraper from: {start_url}")
            
            current_url = start_url
            page_count = 0
            max_pages = self.config.pagination.get('max_pages', 5) if self.config.pagination else 5
            
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
                
                # Get next page
                if self.config.max_items and len(licitaciones) >= self.config.max_items:
                    break
                
                next_url = await self.get_next_page_url(html, current_url)
                if not next_url or next_url == current_url:
                    break
                
                current_url = next_url
                page_count += 1
            
            logger.info(f"UNCuyo scraper complete. Found {len(licitaciones)} licitaciones")
            return licitaciones
            
        finally:
            await self.cleanup()
