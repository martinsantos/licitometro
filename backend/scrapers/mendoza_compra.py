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
from urllib.parse import quote_plus
import os

# Add parent directory to path so we can import modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper
from utils.dates import parse_date_guess, last_business_days_set

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
            source_url = url
            if licitacion_number:
                source_url = f"{url}#proceso={licitacion_number}"
            licitacion_data = {
                "title": title,
                "organization": organization,
                "publication_date": publication_date,
                "opening_date": opening_date,
                "expedient_number": expedient_number,
                "licitacion_number": licitacion_number,
                "description": description,
                "contact": contact,
                "source_url": source_url,
                "status": "active",
                "location": "Mendoza",
                "attached_files": attached_files,
                "id_licitacion": licitacion_number or str(uuid.uuid4()),
                "jurisdiccion": "Mendoza",
                "tipo_procedimiento": tipo_procedimiento,
                "tipo_acceso": "COMPR.AR",
                "fecha_scraping": datetime.utcnow(),
                "fuente": "COMPR.AR Mendoza",
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

    def _extract_list_urls(self, html: str) -> List[str]:
        """Extract list URLs like Compras.aspx?qs=... from homepage."""
        soup = BeautifulSoup(html, 'html.parser')
        base_url = str(self.config.url)
        urls: List[str] = []
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            text = a.get_text(' ', strip=True).lower()
            if href.startswith('javascript:'):
                continue
            if 'compras.aspx' in href.lower() and 'qs=' in href.lower():
                urls.append(urljoin(base_url, href))
            if 'procesos con apertura' in text or 'últimos 30 días' in text:
                if href:
                    urls.append(urljoin(base_url, href))
        # de-dup
        return list(dict.fromkeys(urls))

    def _extract_detail_links_from_list(self, html: str) -> List[str]:
        """Extract detail links from Compras.aspx list table."""
        soup = BeautifulSoup(html, 'html.parser')
        base_url = str(self.config.url)
        links: List[str] = []
        # First column usually contains a link to the process
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            if 'Compras.aspx' in href or 'Compras' in href or 'qs=' in href:
                links.append(urljoin(base_url, href))
        return list(dict.fromkeys(links))

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

    def _extract_row_targets(self, html: str) -> List[str]:
        """Extract postback targets for detail rows (lnkNumeroProceso)."""
        soup = BeautifulSoup(html, 'html.parser')
        targets: List[str] = []
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            m = re.search(r"__doPostBack\('([^']+)'\s*,\s*'([^']*)'\)", href)
            if not m:
                continue
            target, arg = m.group(1), m.group(2)
            if "lnkNumeroProceso" in target and arg == "":
                targets.append(target)
        return list(dict.fromkeys(targets))

    def _extract_pager_args(self, html: str) -> Dict[str, List[str]]:
        """Extract paging args for grids: {grid_id: [Page$2, Page$3, ...]}."""
        soup = BeautifulSoup(html, 'html.parser')
        pages: Dict[str, List[str]] = {}
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            m = re.search(r"__doPostBack\('([^']+)'\s*,\s*'([^']*)'\)", href)
            if not m:
                continue
            target, arg = m.group(1), m.group(2)
            if arg.startswith("Page$"):
                pages.setdefault(target, []).append(arg)
        # de-dup
        for k, v in list(pages.items()):
            pages[k] = list(dict.fromkeys(v))
        return pages

    def _extract_rows_from_list(self, html: str) -> List[Dict[str, Any]]:
        """Extract row data from Compras list table."""
        soup = BeautifulSoup(html, 'html.parser')
        table = soup.find('table', {'id': re.compile('GridListaPliegosAperturaProxima')})
        if not table:
            return []
        rows = []
        for row in table.find_all('tr'):
            cols = row.find_all('td')
            if len(cols) < 6:
                continue
            # First column contains the process number and postback target
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
            unidad = cols[5].get_text(' ', strip=True) if len(cols) > 5 else None
            servicio_admin = cols[6].get_text(' ', strip=True) if len(cols) > 6 else None
            rows.append({
                "target": target,
                "numero": numero,
                "title": title,
                "tipo": tipo,
                "apertura": apertura,
                "estado": estado,
                "unidad": unidad,
                "servicio_admin": servicio_admin,
            })
        return rows

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

            # Prefer direct list URLs (Compras.aspx?qs=...) for broader coverage
            list_urls = []
            cfg_urls = self.config.pagination.get("list_urls") if self.config.pagination else None
            if cfg_urls:
                list_urls.extend(cfg_urls if isinstance(cfg_urls, list) else [cfg_urls])
            list_urls.extend(self._extract_list_urls(home_html))
            list_urls = list(dict.fromkeys(list_urls))
            row_entries: List[Dict[str, Any]] = []
            max_pages = int(self.config.selectors.get("max_pages", 20))

            async def process_list_page(page_html: str, page_url: str):
                rows = self._extract_rows_from_list(page_html)
                if rows:
                    logger.info(f"Found {len(rows)} procesos en {page_url}")
                for row in rows:
                    row_entries.append({
                        **row,
                        "list_url": page_url,
                    })

            async def process_list_seed(seed_html: str, seed_url: str):
                current_html = seed_html
                await process_list_page(current_html, seed_url)

                pages = self._extract_pager_args(current_html)
                grid_targets = list(pages.keys())
                if not grid_targets:
                    return
                grid_target = grid_targets[0]
                page_queue = pages.get(grid_target, [])

                for arg in page_queue[:max_pages]:
                    fields = self._extract_hidden_fields(current_html)
                    fields["__EVENTTARGET"] = grid_target
                    fields["__EVENTARGUMENT"] = arg
                    next_html = await self._postback(seed_url, fields)
                    if not next_html:
                        continue
                    current_html = next_html
                    await process_list_page(current_html, seed_url)
                    await asyncio.sleep(self.config.wait_time)

            for list_url in list_urls:
                list_html = await self.fetch_page(list_url)
                if not list_html:
                    continue

                # Process default list
                await process_list_seed(list_html, list_url)

                # If configured, trigger "últimos 30 días" list and process it too
                list_event = self.config.pagination.get("list_event_target") if self.config.pagination else None
                if list_event:
                    fields = self._extract_hidden_fields(list_html)
                    fields["__EVENTTARGET"] = list_event
                    fields["__EVENTARGUMENT"] = ""
                    alt_html = await self._postback(list_url, fields)
                    if alt_html:
                        await process_list_seed(alt_html, list_url)

            # Fallback to postback list if no list URLs found
            if not row_entries:
                fields = self._extract_hidden_fields(home_html)
                list_event = self.config.pagination.get(
                    "list_event_target", "ctl00$CPH1$CtrlConsultasFrecuentes$btnProcesoCompraTreintaDias"
                )
                fields["__EVENTTARGET"] = list_event
                fields["__EVENTARGUMENT"] = ""
                list_html = await self._postback(base_url, fields)
                if list_html:
                    await process_list_page(list_html, base_url)

            # Define business window (hoy + 3 dias habiles)
            window_days = self.config.selectors.get("business_days_window", 4)
            tz_name = self.config.selectors.get("timezone", "America/Argentina/Mendoza")
            allowed_dates = last_business_days_set(count=window_days, tz_name=tz_name)

            api_base = self.config.selectors.get("api_base_url") if self.config.selectors else None
            if not api_base:
                api_base = os.getenv("API_BASE_URL", "http://localhost:8001")

            seen_ids = set()
            for entry in row_entries:
                numero = entry.get("numero")
                title = entry.get("title") or "Proceso de compra"
                tipo = entry.get("tipo") or "Proceso de compra"
                apertura = entry.get("apertura")
                estado = entry.get("estado")
                unidad = entry.get("unidad")
                servicio_admin = entry.get("servicio_admin")
                list_url = entry.get("list_url") or base_url
                target = entry.get("target")

                opening_date = parse_date_guess(apertura) if apertura else None
                publication_date = opening_date or datetime.utcnow()

                meta = {
                    "comprar_list_url": list_url,
                    "comprar_target": target,
                    "comprar_estado": estado,
                    "comprar_unidad_ejecutora": unidad,
                    "comprar_servicio_admin": servicio_admin,
                }
                proxy_open_url = None
                proxy_html_url = None
                if target:
                    proxy_open_url = f"{api_base}/api/comprar/proceso/open?list_url={quote_plus(list_url)}&target={quote_plus(target)}"
                    proxy_html_url = f"{api_base}/api/comprar/proceso/html?list_url={quote_plus(list_url)}&target={quote_plus(target)}"

                lic = LicitacionCreate(**{
                    "title": title,
                    "organization": servicio_admin or unidad or "Gobierno de Mendoza",
                    "publication_date": publication_date,
                    "opening_date": opening_date,
                    "expedient_number": None,
                    "licitacion_number": numero,
                    "description": title,
                    "contact": None,
                    "source_url": proxy_open_url or list_url,
                    "status": "active" if not estado else ("active" if "publicado" in estado.lower() else "active"),
                    "location": "Mendoza",
                    "attached_files": [],
                    "id_licitacion": numero or str(uuid.uuid4()),
                    "jurisdiccion": "Mendoza",
                    "tipo_procedimiento": tipo,
                    "tipo_acceso": "COMPR.AR",
                    "fecha_scraping": datetime.utcnow(),
                    "fuente": "COMPR.AR Mendoza",
                    "metadata": {
                        **meta,
                        "comprar_open_url": proxy_open_url,
                        "comprar_detail_url": proxy_html_url,
                    },
                })

                if lic.id_licitacion in seen_ids:
                    continue
                pub_date = lic.publication_date.date()
                if pub_date not in allowed_dates and lic.opening_date:
                    pub_date = lic.opening_date.date()
                if pub_date in allowed_dates:
                    licitaciones.append(lic)
                    seen_ids.add(lic.id_licitacion)
                if self.config.max_items and len(licitaciones) >= self.config.max_items:
                    break

            # Order by publication date (newest first)
            licitaciones.sort(key=lambda l: l.publication_date, reverse=True)
            return licitaciones
        finally:
            await self.cleanup()
