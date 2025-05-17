from typing import List, Dict, Any, Optional
import logging
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from datetime import datetime
import re
import uuid
import sys
from pathlib import Path

# Add parent directory to path so we can import modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper

logger = logging.getLogger("scraper.mendoza_compra")

class MendozaCompraScraper(BaseScraper):
    """Scraper for Mendoza Compra"""
    
    def __init__(self, config: ScraperConfig):
        super().__init__(config)
    
    async def extract_licitacion_data(self, html: str, url: str) -> Optional[LicitacionCreate]:
        """Extract licitacion data from HTML"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # This is a simplified extraction - actual implementation may need to be adjusted
            # based on the actual structure of the page
            
            # Try to extract the title
            title_elem = soup.select_one(self.config.selectors.get("title", "h1.titulo-licitacion"))
            if not title_elem:
                return None
            
            title = title_elem.text.strip()
            
            # Extract other fields
            organization_elem = soup.select_one(self.config.selectors.get("organization", "div.organismo"))
            organization = organization_elem.text.strip() if organization_elem else "Gobierno de Mendoza"
            
            # Extract dates
            pub_date_elem = soup.select_one(self.config.selectors.get("publication_date", "div.fecha-publicacion"))
            publication_date = None
            if pub_date_elem:
                pub_date_text = pub_date_elem.text.strip()
                # Parse date from text like "Fecha de Publicación: 01/05/2023"
                date_match = re.search(r'(\d{2}/\d{2}/\d{4})', pub_date_text)
                if date_match:
                    try:
                        publication_date = datetime.strptime(date_match.group(1), '%d/%m/%Y')
                    except ValueError:
                        publication_date = datetime.utcnow()
            
            if not publication_date:
                publication_date = datetime.utcnow()
            
            # Opening date
            open_date_elem = soup.select_one(self.config.selectors.get("opening_date", "div.fecha-apertura"))
            opening_date = None
            if open_date_elem:
                open_date_text = open_date_elem.text.strip()
                date_match = re.search(r'(\d{2}/\d{2}/\d{4})', open_date_text)
                if date_match:
                    try:
                        opening_date = datetime.strptime(date_match.group(1), '%d/%m/%Y')
                    except ValueError:
                        pass
            
            # File number
            expedient_elem = soup.select_one(self.config.selectors.get("expedient_number", "div.expediente"))
            expedient_number = expedient_elem.text.strip() if expedient_elem else None
            
            # Licitacion number
            licitacion_num_elem = soup.select_one(self.config.selectors.get("licitacion_number", "div.numero-licitacion"))
            licitacion_number = licitacion_num_elem.text.strip() if licitacion_num_elem else None
            
            # Description
            description_elem = soup.select_one(self.config.selectors.get("description", "div.descripcion"))
            description = description_elem.text.strip() if description_elem else None
            
            # Location
            location_elem = soup.select_one(self.config.selectors.get("location", "div.ubicacion"))
            location = location_elem.text.strip() if location_elem else "Mendoza"
            
            # Contact
            contact_elem = soup.select_one(self.config.selectors.get("contact", "div.contacto"))
            contact = contact_elem.text.strip() if contact_elem else None
            
            # Attached files
            attached_files = []
            file_elems = soup.select(self.config.selectors.get("attached_files", "div.documentos a"))
            for file_elem in file_elems:
                file_url = file_elem.get('href')
                if file_url:
                    file_url = urljoin(url, file_url)
                    file_name = file_elem.text.strip() or file_url.split('/')[-1]
                    attached_files.append({
                        "name": file_name,
                        "url": file_url,
                        "type": file_url.split('.')[-1].lower() if '.' in file_url else "unknown"
                    })
            
            # Create the licitacion object
            licitacion_data = {
                "title": title,
                "organization": organization,
                "publication_date": publication_date,
                "opening_date": opening_date,
                "expedient_number": expedient_number,
                "licitacion_number": licitacion_number,
                "description": description,
                "contact": contact,
                "source_url": url,
                "status": "active",
                "location": location,
                "attached_files": attached_files,
            }
            
            return LicitacionCreate(**licitacion_data)
        
        except Exception as e:
            logger.error(f"Error extracting licitacion data from {url}: {e}")
            return None
    
    async def extract_links(self, html: str) -> List[str]:
        """Extract links to licitacion pages"""
        soup = BeautifulSoup(html, 'html.parser')
        links = []
        
        # Extract links based on the selectors in the configuration
        link_elems = soup.select(self.config.selectors.get("links", "div.listado-licitaciones a.ver-mas"))
        base_url = str(self.config.url)
        
        for link_elem in link_elems:
            href = link_elem.get('href')
            if href:
                if href.startswith('http'):
                    links.append(href)
                else:
                    links.append(urljoin(base_url, href))
        
        return links
    
    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        """Get the URL of the next page for pagination"""
        if not self.config.pagination:
            return None
        
        soup = BeautifulSoup(html, 'html.parser')
        
        # Extract the next page link based on the pagination configuration
        next_page_selector = self.config.pagination.get("next_page_selector", "a.pagina-siguiente")
        next_page_elem = soup.select_one(next_page_selector)
        
        if next_page_elem and next_page_elem.get('href'):
            next_page_url = next_page_elem.get('href')
            if next_page_url.startswith('http'):
                return next_page_url
            else:
                return urljoin(current_url, next_page_url)
        
        return None
