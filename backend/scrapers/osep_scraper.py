"""
OSEP (Obra Social de Empleados Públicos) Scraper.

Fuentes:
- https://comprarosep.mendoza.gov.ar/ (portal COMPR.AR propio)
"""

from typing import List, Dict, Any, Optional
import asyncio
import logging
import hashlib
from bs4 import BeautifulSoup
from urllib.parse import urljoin, quote_plus
from datetime import datetime
import re
import uuid
import sys
from pathlib import Path
import os

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper
from utils.dates import parse_date_guess

logger = logging.getLogger("scraper.osep")


class OsepScraper(BaseScraper):
    """
    Scraper for OSEP (Obra Social de Empleados Públicos de Mendoza).
    Uses their own COMPR.AR portal.
    """
    
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
            
            title = value_by_label(["Nombre descriptivo del proceso", "Nombre descriptivo de proceso"]) or "Proceso OSEP"
            organization = "OSEP - Obra Social de Empleados Públicos"
            expedient_number = value_by_label(["Número de expediente"])
            licitacion_number = value_by_label(["Número de proceso", "Nº de proceso"])
            description = value_by_label(["Objeto de la contratación", "Objeto"])
            tipo_procedimiento = value_by_label(["Procedimiento de selección"]) or "Proceso de compra"
            contact = value_by_label(["Consultas", "Contacto"])
            
            # Parse dates from selectors
            pub_raw = value_by_label(["Fecha y hora estimada de publicación en el portal", "Fecha de publicación"])
            pub_date_parsed = parse_date_guess(pub_raw) if pub_raw else None

            open_raw = value_by_label(["Fecha y hora acto de apertura", "Fecha de Apertura"])
            opening_date_parsed = parse_date_guess(open_raw) if open_raw else None

            attached_files = []
            for a in soup.find_all('a', href=True):
                href = a.get('href')
                if not href:
                    continue
                if any(ext in href.lower() for ext in [".pdf", ".doc", ".docx", ".xls", ".xlsx"]):
                    attached_files.append({
                        "name": a.get_text(' ', strip=True) or href.split('/')[-1],
                        "url": urljoin(url, href),
                        "type": href.split('.')[-1].lower() if '.' in href else "unknown",
                        "filename": href.split('/')[-1]
                    })

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
            
            # Compute estado
            estado = self._compute_estado(publication_date, opening_date, fecha_prorroga=None)

            content_hash = hashlib.md5(
                f"{title.lower().strip()}|osep|{publication_date.strftime('%Y%m%d') if publication_date else 'unknown'}".encode()
            ).hexdigest()

            lic = LicitacionCreate(
                title=title,
                organization=organization,
                publication_date=publication_date,
                opening_date=opening_date,
                expedient_number=expedient_number,
                licitacion_number=licitacion_number,
                description=description,
                contact=contact,
                source_url=url,
                canonical_url=url,
                source_urls={"osep_detail": url},
                url_quality="direct",
                content_hash=content_hash,
                status="active",
                location="Mendoza",
                attached_files=attached_files,
                id_licitacion=licitacion_number or str(uuid.uuid4()),
                jurisdiccion="Mendoza",
                tipo_procedimiento=tipo_procedimiento,
                tipo_acceso="COMPR.AR OSEP",
                fecha_scraping=datetime.utcnow(),
                fuente="OSEP",
                estado=estado,
                fecha_prorroga=None,
            )
            
            return lic
            
        except Exception as e:
            logger.error(f"Error extracting licitacion data from {url}: {e}")
            return None
    
    async def extract_links(self, html: str) -> List[str]:
        """Extract links to licitacion pages"""
        soup = BeautifulSoup(html, 'html.parser')
        links = []
        base_url = str(self.config.url)
        
        link_elems = soup.select(self.config.selectors.get("links", "a"))
        
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
        
        next_page_selector = self.config.pagination.get("next_page_selector", "a.next-page")
        next_page_elem = soup.select_one(next_page_selector)
        
        if next_page_elem and next_page_elem.get('href'):
            next_page_url = next_page_elem.get('href')
            if next_page_url.startswith('http'):
                return next_page_url
            else:
                return urljoin(current_url, next_page_url)
        
        return None
    
    def _extract_rows_from_list(self, html: str) -> List[Dict[str, Any]]:
        """Extract row data from Compras list table (similar to mendoza_compra)"""
        soup = BeautifulSoup(html, 'html.parser')
        table = soup.find('table', {'id': re.compile('GridListaPliegos')})
        if not table:
            return []
        
        rows = []
        for row in table.find_all('tr'):
            cols = row.find_all('td')
            if len(cols) < 6:
                continue
            
            link = cols[0].find('a', href=True)
            target = None
            if link:
                m = re.search(r"__doPostBack\('([^']+)'\s*,\s*'([^']*)'\)", link.get('href', ''))
                if m:
                    target = m.group(1)
            
            numero = cols[0].get_text(' ', strip=True)
            title = cols[1].get_text(' ', strip=True)
            tipo = cols[2].get_text(' ', strip=True)
            apertura = cols[3].get_text(' ', strip=True)
            estado = cols[4].get_text(' ', strip=True)
            
            rows.append({
                "target": target,
                "numero": numero,
                "title": title,
                "tipo": tipo,
                "apertura": apertura,
                "estado": estado,
            })
        
        return rows
    
    def _extract_hidden_fields(self, html: str) -> Dict[str, str]:
        """Extract ASP.NET hidden fields"""
        soup = BeautifulSoup(html, 'html.parser')
        fields: Dict[str, str] = {}
        for name in ["__VIEWSTATE", "__EVENTVALIDATION", "__VIEWSTATEGENERATOR", "__EVENTTARGET", "__EVENTARGUMENT"]:
            inp = soup.find('input', {'name': name})
            if inp and inp.get('value') is not None:
                fields[name] = inp.get('value')
        return fields
    
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
        """Run the OSEP scraper"""
        await self.setup()
        
        try:
            licitaciones: List[LicitacionCreate] = []
            base_url = str(self.config.url)
            
            logger.info(f"Starting OSEP scraper with URL: {base_url}")
            
            # Get list URLs from config
            list_urls = []
            cfg_urls = self.config.pagination.get("list_urls") if self.config.pagination else None
            if cfg_urls:
                list_urls.extend(cfg_urls if isinstance(cfg_urls, list) else [cfg_urls])
            
            if not list_urls:
                logger.error("No list URLs configured for OSEP")
                return []
            
            api_base = self.config.selectors.get("api_base_url") or os.getenv("API_BASE_URL", "http://localhost:8001")
            
            for list_url in list_urls:
                logger.info(f"Processing OSEP list: {list_url}")
                list_html = await self.fetch_page(list_url)
                if not list_html:
                    continue
                
                rows = self._extract_rows_from_list(list_html)
                logger.info(f"Found {len(rows)} rows in OSEP list")
                
                list_fields = self._extract_hidden_fields(list_html)
                
                for row in rows:
                    numero = row.get("numero")
                    title = row.get("title") or "Proceso OSEP"
                    tipo = row.get("tipo") or "Proceso de compra"
                    apertura = row.get("apertura")
                    estado = row.get("estado")
                    target = row.get("target")

                    opening_date_parsed = parse_date_guess(apertura) if apertura else None

                    # VIGENCIA MODEL: Resolve dates
                    publication_date = self._resolve_publication_date(
                        parsed_date=None,  # No pub date in list
                        title=title,
                        description=title,
                        opening_date=opening_date_parsed,
                        attached_files=[]
                    )

                    opening_date = self._resolve_opening_date(
                        parsed_date=opening_date_parsed,
                        title=title,
                        description=title,
                        publication_date=publication_date,
                        attached_files=[]
                    )
                    
                    # Build proxy URLs
                    proxy_open_url = None
                    if target:
                        proxy_open_url = f"{api_base}/api/comprar/proceso/open?list_url={quote_plus(list_url)}&target={quote_plus(target)}"
                    
                    # Compute estado
                    estado_vigencia = self._compute_estado(publication_date, opening_date, fecha_prorroga=None)

                    content_hash = hashlib.md5(
                        f"{title.lower().strip()}|osep|{publication_date.strftime('%Y%m%d') if publication_date else 'unknown'}".encode()
                    ).hexdigest()

                    lic = LicitacionCreate(
                        title=title,
                        organization="OSEP - Obra Social de Empleados Públicos",
                        publication_date=publication_date,
                        opening_date=opening_date,
                        expedient_number=None,
                        licitacion_number=numero,
                        description=title,
                        contact=None,
                        source_url=proxy_open_url or list_url,
                        canonical_url=proxy_open_url,
                        source_urls={
                            "osep_list": list_url,
                            "osep_proxy": proxy_open_url,
                        } if proxy_open_url else {"osep_list": list_url},
                        url_quality="proxy" if proxy_open_url else "partial",
                        content_hash=content_hash,
                        status="active",
                        location="Mendoza",
                        attached_files=[],
                        id_licitacion=numero or str(uuid.uuid4()),
                        jurisdiccion="Mendoza",
                        tipo_procedimiento=tipo,
                        tipo_acceso="COMPR.AR OSEP",
                        fecha_scraping=datetime.utcnow(),
                        fuente="OSEP",
                        metadata={
                            "osep_list_url": list_url,
                            "osep_target": target,
                            "osep_estado": estado,
                        },
                        estado=estado_vigencia,
                        fecha_prorroga=None,
                    )
                    
                    licitaciones.append(lic)
                    
                    if self.config.max_items and len(licitaciones) >= self.config.max_items:
                        break
                    
                    await asyncio.sleep(self.config.wait_time)
            
            logger.info(f"OSEP scraper complete. Found {len(licitaciones)} licitaciones")
            return licitaciones
            
        finally:
            await self.cleanup()
