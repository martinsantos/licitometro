from typing import List, Dict, Any, Optional
import asyncio
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
from utils.dates import parse_date_guess

logger = logging.getLogger("scraper.mendoza_compra")

class MendozaCompraScraper(BaseScraper):
    """Scraper for Mendoza Compra"""
    
    def __init__(self, config: ScraperConfig):
        super().__init__(config)
    
    async def extract_licitacion_data(self, html: str, url: str) -> Optional[LicitacionCreate]:
        """Extract licitacion data from HTML"""
        try:
            soup = BeautifulSoup(html, 'html.parser')

            def value_by_label(label_texts):
                for lab in soup.find_all('label'):
                    text = lab.get_text(' ', strip=True)
                    if any(t.lower() in text.lower() for t in label_texts):
                        nxt = lab.find_next_sibling()
                        if nxt:
                            return nxt.get_text(' ', strip=True)
                return None

            title = value_by_label(["Nombre descriptivo del proceso", "Nombre descriptivo de proceso"]) or "Proceso de compra"
            organization = value_by_label(["Unidad Operativa de Contrataciones", "Unidad Ejecutora"]) or "Gobierno de Mendoza"
            expedient_number = value_by_label(["Número de expediente"])
            licitacion_number = value_by_label(["Número de proceso", "Nº de proceso"])
            description = value_by_label(["Objeto de la contratación", "Objeto"])
            tipo_procedimiento = value_by_label(["Procedimiento de selección"]) or "Proceso de compra"
            contact = value_by_label(["Consultas", "Contacto"])

            publication_date = None
            pub_raw = value_by_label(["Fecha y hora estimada de publicación en el portal", "Fecha de publicación"])
            if pub_raw:
                publication_date = parse_date_guess(pub_raw)
            if not publication_date:
                publication_date = datetime.utcnow()

            opening_date = None
            open_raw = value_by_label(["Fecha y hora acto de apertura", "Fecha de Apertura"])
            if open_raw:
                opening_date = parse_date_guess(open_raw)

            attached_files = []
            for a in soup.find_all('a', href=True):
                href = a.get('href')
                if not href:
                    continue
                if any(ext in href.lower() for ext in [".pdf", ".doc", ".docx", ".xls", ".xlsx"]):
                    attached_files.append({
                        "name": a.get_text(' ', strip=True) or href.split('/')[-1],
                        "url": urljoin(url, href),
                        "type": href.split('.')[-1].lower() if '.' in href else "unknown"
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
                "location": "Mendoza",
                "attached_files": attached_files,
                "id_licitacion": licitacion_number or str(uuid.uuid4()),
                "jurisdiccion": "Mendoza",
                "tipo_procedimiento": tipo_procedimiento,
                "tipo_acceso": "COMPR.AR",
                "fecha_scraping": datetime.utcnow(),
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
        link_elems = soup.select(self.config.selectors.get("links", "a"))
        base_url = str(self.config.url)
        
        for link_elem in link_elems:
            href = link_elem.get('href')
            if href:
                if href.startswith('javascript:') or href.startswith('#'):
                    continue
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
                return urljoin(str(current_url), next_page_url)
        
        return None

    def _extract_hidden_fields(self, html: str) -> Dict[str, str]:
        soup = BeautifulSoup(html, 'html.parser')
        fields: Dict[str, str] = {}
        for name in ["__VIEWSTATE", "__EVENTVALIDATION", "__VIEWSTATEGENERATOR", "__EVENTTARGET", "__EVENTARGUMENT"]:
            inp = soup.find('input', {'name': name})
            if inp and inp.get('value') is not None:
                fields[name] = inp.get('value')
        for inp in soup.find_all('input', {'type': 'hidden'}):
            name = inp.get('name')
            if name and name not in fields:
                fields[name] = inp.get('value', '')
        return fields

    def _extract_postback_targets(self, html: str) -> List[str]:
        soup = BeautifulSoup(html, 'html.parser')
        targets: List[str] = []
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            m = re.search(r"__doPostBack\('([^']+)'\s*,\s*'([^']*)'\)", href)
            if m:
                targets.append(m.group(1))
        return targets

    async def _postback(self, url: str, fields: Dict[str, str]) -> Optional[str]:
        try:
            async with self.session.post(str(url), data=fields) as response:
                if response.status < 200 or response.status >= 300:
                    logger.error(f"Postback failed {response.status}")
                    return None
                return await response.text()
        except Exception as e:
            logger.error(f"Postback error: {e}")
            return None

    async def run(self) -> List[LicitacionCreate]:
        await self.setup()
        try:
            licitaciones: List[LicitacionCreate] = []
            base_url = str(self.config.url)
            home_html = await self.fetch_page(base_url)
            if not home_html:
                return []

            fields = self._extract_hidden_fields(home_html)
            list_event = self.config.pagination.get(
                "list_event_target", "ctl00$CPH1$CtrlConsultasFrecuentes$btnProcesoCompraTreintaDias"
            )
            fields["__EVENTTARGET"] = list_event
            fields["__EVENTARGUMENT"] = ""
            list_html = await self._postback(base_url, fields)
            if not list_html:
                return []

            targets = self._extract_postback_targets(list_html)
            list_fields = self._extract_hidden_fields(list_html)

            for target in targets:
                detail_fields = dict(list_fields)
                detail_fields["__EVENTTARGET"] = target
                detail_fields["__EVENTARGUMENT"] = ""
                detail_html = await self._postback(base_url, detail_fields)
                if detail_html:
                    lic = await self.extract_licitacion_data(detail_html, base_url)
                    if lic:
                        licitaciones.append(lic)
                await asyncio.sleep(self.config.wait_time)
                if self.config.max_items and len(licitaciones) >= self.config.max_items:
                    break

            return licitaciones
        finally:
            await self.cleanup()
