from typing import List, Dict, Any, Optional
import asyncio
import logging
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from datetime import datetime
import re
import uuid
import sys
import hashlib
from pathlib import Path
from urllib.parse import quote_plus
import os
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

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

    def _extract_pliego_url(self, html: str, base_url: str) -> Optional[str]:
        """Extract unique PLIEGO URL from detail HTML."""
        soup = BeautifulSoup(html, 'html.parser')
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            if 'VistaPreviaPliegoCiudadano.aspx?qs=' in href:
                return urljoin(base_url, href)
        # Fallback: raw search in HTML
        m = re.search(r"(PLIEGO\\/VistaPreviaPliegoCiudadano\\.aspx\\?qs=[^\\\"'\\s]+)", html)
        if m:
            return urljoin(base_url, m.group(1))
        return None

    def _extract_compras_url(self, html: str, base_url: str) -> Optional[str]:
        """Extract ComprasElectronicas.aspx URL from detail HTML.

        This is the main detail page URL which is stable (uses qs parameter).
        Use as fallback when PLIEGO URL is not available.
        """
        soup = BeautifulSoup(html, 'html.parser')
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            if 'ComprasElectronicas.aspx?qs=' in href:
                return urljoin(base_url, href)
        # Also check for window.open calls or onclick handlers
        for elem in soup.find_all(onclick=True):
            onclick = elem.get('onclick', '')
            m = re.search(r"ComprasElectronicas\.aspx\?qs=([^'\"]+)", onclick)
            if m:
                return urljoin(base_url, f"ComprasElectronicas.aspx?qs={m.group(1)}")
        # Fallback: raw search in HTML
        m = re.search(r"(ComprasElectronicas\.aspx\?qs=[^\s\"'<>]+)", html)
        if m:
            return urljoin(base_url, m.group(1))
        return None

    def _parse_pliego_fields(self, html: str) -> Dict[str, Any]:
        """Parse key fields from PLIEGO page including cronograma, info básica, items."""
        soup = BeautifulSoup(html, 'html.parser')
        data: Dict[str, Any] = {}

        # --- 1. Basic Label/Value Extraction (General) ---
        for lab in soup.find_all('label'):
            key = lab.get_text(' ', strip=True).rstrip(':')
            if not key:
                continue
            nxt = lab.find_next_sibling()
            val = nxt.get_text(' ', strip=True) if nxt else ''
            if val:
                data[key] = val

        # --- 2. CRONOGRAMA (Specific ID targeting for precision) ---
        # IDs patterns: ctl00_CPH1_UCVistaPreviaPliego_UC_Cronograma_lblFechaPublicacion
        crono_map = {
             "lblFechaPublicacion": "Fecha y hora estimada de publicación en el portal",
             "lblFechaInicioConsultas": "Fecha y hora inicio de consultas",
             "lblFechaFinalConsultas": "Fecha y hora final de consultas",
             "lblFechaActoApertura": "Fecha y hora acto de apertura",
             "lblFechaInicioPresentacionOfertas": "Fecha inicio presentación de ofertas",
             "lblFechaFinPresentacionOfertas": "Fecha fin presentación de ofertas",
        }
        for suffix, label in crono_map.items():
            # Find span ending with unique suffix
            span = soup.find('span', id=lambda x: x and x.endswith(f"_UC_Cronograma_{suffix}"))
            if span:
                 data[label] = span.get_text(strip=True)

        # --- 3. GARANTIAS ---
        garantias = []
        garantias_heading = soup.find('h4', string=re.compile('Garantías', re.IGNORECASE))
        if garantias_heading:
            panel_garantias = garantias_heading.find_parent('div', class_='list-group') or garantias_heading.find_parent('div', class_='panel')
            if panel_garantias:
                for item in panel_garantias.find_all('div', class_='list-group-item'):
                    if 'list-heading' in item.get('class', []):
                        continue
                    
                    titulo_tag = item.find('h5') or item.find('strong')
                    if not titulo_tag:
                        continue
                    
                    titulo = titulo_tag.get_text(strip=True)
                    detalle = ""
                    
                    # Content might be in a row or form-horizontal div
                    content_div = item.find('div', class_='row')
                    if content_div:
                        detalle = content_div.get_text(" ", strip=True).replace(titulo, "").strip()
                    
                    if titulo:
                         # Clean up details
                        detalle = re.sub(r'\s+', ' ', detalle).strip()
                        garantias.append({
                            "titulo": titulo,
                            "detalle": detalle
                        })
        
        if garantias:
            data["_garantias"] = garantias

        # --- 4. ITEMS (Detalle de productos) ---
        items = []
        # Find table by ID heuristic or header
        products_table = soup.find('table', id=re.compile('GridDetalle', re.I))
        if not products_table:
             # Fallback to header search
             for header in soup.find_all(['h3', 'h4', 'h5']):
                 if "productos" in header.get_text(strip=True).lower():
                     products_table = header.find_next('table')
                     break

        if products_table:
            rows = products_table.find_all('tr')
            if len(rows) > 1:
                # Headers parsing
                header_cells = rows[0].find_all(['th', 'td'])
                h_map = {}
                for idx, cell in enumerate(header_cells):
                    txt = cell.get_text(strip=True).lower()
                    if 'renglon' in txt or '#' in txt: h_map['numero'] = idx
                    elif 'código' in txt or 'item' in txt: h_map['codigo'] = idx
                    elif 'descripción' in txt: h_map['descripcion'] = idx
                    elif 'cantidad' in txt: h_map['cantidad'] = idx
                    elif 'unidad' in txt: h_map['unidad'] = idx
                    elif 'precio' in txt or 'valor' in txt or 'unitario' in txt: h_map['precio'] = idx
                    elif 'total' in txt: h_map['total'] = idx
                
                # Rows parsing
                for row in rows[1:]:
                    cols = row.find_all('td')
                    if not cols: continue
                    get_col = lambda k: cols[h_map[k]].get_text(' ', strip=True) if k in h_map and h_map[k] < len(cols) else ""
                    
                    item = {
                        "numero_renglon": get_col('numero'),
                        "codigo_item": get_col('codigo'),
                        "descripcion": get_col('descripcion'),
                        "cantidad": get_col('cantidad'),
                        "unidad": get_col('unidad'),
                        "precio_unitario": get_col('precio'),
                        "precio_total": get_col('total'),
                    }
                    if not item['descripcion'] and len(cols)>1:
                        # Fallback heuristic
                        item['descripcion'] = cols[1].get_text(' ', strip=True)
                        
                    if item['descripcion']:
                        items.append(item)
        
        if items:
            data["_items"] = items

        # --- 5. ATTACHED FILES (Links) ---
        files = []
        base_url = "https://comprar.mendoza.gov.ar"
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            text = a.get_text(strip=True)
            
            # Skip JS links
            if href.lower().startswith('javascript'):
                continue

            # Detect file types
            lower_href = href.lower()
            if any(ext in lower_href for ext in ['.pdf', '.doc', '.xls', '.zip', '.rar']):
                full_url = urljoin(base_url, href)
                files.append({
                    "name": text or "Archivo Adjunto",
                    "url": full_url,
                    "type": lower_href.split('.')[-1]
                })
            # Links that say "Descargar"
            elif "descargar" in text.lower():
                full_url = urljoin(base_url, href)
                files.append({
                     "name": text,
                     "url": full_url,
                     "type": "unknown"
                })

        if files:
            data["_attached_files"] = files

        # Extract Anexos
        anexos = []
        anexos_table = soup.find('table', id=re.compile('GridAnexos', re.I))
        if not anexos_table:
             for header in soup.find_all(['h3', 'h4', 'h5']):
                 if "Anexos" in header.get_text(strip=True):
                     anexos_table = header.find_next('table')
                     break
        
        if anexos_table:
             rows = anexos_table.find_all('tr')
             for row in rows[1:]:
                 cols = row.find_all('td')
                 if len(cols) >= 2:
                     anexo = {
                         "nombre": cols[0].get_text(' ', strip=True),
                         "fecha": cols[1].get_text(' ', strip=True) if len(cols) > 1 else "",
                         "descripcion": cols[2].get_text(' ', strip=True) if len(cols) > 2 else ""
                     }
                     # Find link
                     link = row.find('a', href=True)
                     if link:
                         anexo["link"] = link['href']
                     
                     anexos.append(anexo)
        
        if anexos:
            data["_anexos"] = anexos

        # --- Other Tables (Solicitudes, Pliegos, etc.) kept minimal/standard ---
        
        return data


    def _collect_pliego_urls_selenium(self, list_url: str, max_pages: int = 5) -> Dict[str, str]:
        """Collect unique PLIEGO URLs using Selenium (per process number)."""
        mapping: Dict[str, str] = {}
        try:
            options = Options()
            options.add_argument("--headless=new")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            driver = webdriver.Chrome(options=options)
        except Exception as exc:
            logger.error(f"Selenium not available: {exc}")
            return mapping

        try:
            driver.get(list_url)
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima"))
            )
            def goto_page(page_num: int, prev_first: Optional[str]) -> bool:
                if page_num <= 1:
                    return True
                try:
                    pager = driver.find_element(By.LINK_TEXT, str(page_num))
                    try:
                        driver.execute_script("arguments[0].scrollIntoView(true);", pager)
                    except Exception:
                        pass
                    try:
                        driver.execute_script("arguments[0].click();", pager)
                    except Exception:
                        pager.click()
                    WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima"))
                    )
                    if prev_first:
                        def _changed(drv):
                            try:
                                cell = drv.find_element(By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima tr td:first-child a")
                                txt = (cell.text or cell.get_attribute("textContent") or "").strip()
                                return txt != prev_first
                            except Exception:
                                return False
                        WebDriverWait(driver, 10).until(_changed)
                    return True
                except Exception:
                    return False
            current_page = 1
            while current_page <= max_pages:
                prev_first = None
                try:
                    first_cell = driver.find_element(By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima tr td:first-child a")
                    prev_first = (first_cell.text or first_cell.get_attribute("textContent") or "").strip()
                except Exception:
                    prev_first = None

                rows = driver.find_elements(By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima tr td:first-child a")
                logger.info(f"Selenium page {current_page}: {len(rows)} links")
                if rows:
                    sample = []
                    for r in rows[:5]:
                        sample.append((r.text or r.get_attribute("textContent") or "").strip())
                    logger.info(f"Selenium sample links: {sample}")
                numeros = []
                for r in rows:
                    num = (r.text or r.get_attribute("textContent") or "").strip()
                    if num:
                        numeros.append(num)

                for idx, numero in enumerate(numeros):
                    if numero in mapping:
                        continue
                    link = None
                    for _ in range(3):
                        try:
                            link = driver.find_element(By.XPATH, f"//a[normalize-space()='{numero}']")
                            break
                        except Exception:
                            time.sleep(0.5)
                    if link is None:
                        continue
                    prev_url = driver.current_url
                    try:
                        driver.execute_script("arguments[0].scrollIntoView(true);", link)
                    except Exception:
                        pass
                    def _click():
                        try:
                            driver.execute_script("arguments[0].click();", link)
                            return True
                        except Exception:
                            try:
                                link.click()
                                return True
                            except Exception:
                                return False
                    if not _click():
                        continue
                    try:
                        WebDriverWait(driver, 8).until(EC.url_changes(prev_url))
                    except Exception:
                        # retry once if no navigation
                        if not _click():
                            pass
                        else:
                            try:
                                WebDriverWait(driver, 5).until(EC.url_changes(prev_url))
                            except Exception:
                                pass
                    current_url = driver.current_url
                    if idx < 2:
                        logger.info(f"Selenium click {numero} -> {current_url}")
                    if current_url and "comprar.mendoza.gov.ar" in current_url and "Compras.aspx?qs=" not in current_url:
                        mapping[numero] = current_url
                    # Return to list and ensure we stay on the same page
                    driver.get(list_url)
                    WebDriverWait(driver, 15).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima"))
                    )
                    goto_page(current_page, prev_first)

                # pagination
                next_page = current_page + 1
                if next_page > max_pages:
                    break
                if not goto_page(next_page, prev_first):
                    break
                current_page = next_page
        finally:
            driver.quit()
        return mapping

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
                list_fields = self._extract_hidden_fields(page_html)
                for row in rows:
                    detail_html = None
                    if row.get("target"):
                        detail_fields = dict(list_fields)
                        detail_fields["__EVENTTARGET"] = row["target"]
                        detail_fields["__EVENTARGUMENT"] = ""
                        detail_html = await self._postback(page_url, detail_fields)
                        await asyncio.sleep(self.config.wait_time)
                    pliego_url = self._extract_pliego_url(detail_html or "", base_url) if detail_html else None
                    if pliego_url and not pliego_url.startswith(("http://", "https://")):
                        pliego_url = None
                    # Also extract ComprasElectronicas URL as fallback
                    compras_url = self._extract_compras_url(detail_html or "", base_url) if detail_html else None
                    if compras_url and not compras_url.startswith(("http://", "https://")):
                        compras_url = None
                    row_entries.append({
                        **row,
                        "list_url": page_url,
                        "pliego_url": pliego_url,
                        "compras_url": compras_url,
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

                # Optionally collect PLIEGO URLs via Selenium for unique process links
                if self.config.selectors.get("use_selenium_pliego", True):
                    max_pages = int(self.config.selectors.get("selenium_max_pages", 5))
                    pliego_map = self._collect_pliego_urls_selenium(list_url, max_pages=max_pages)
                    logger.info(f"Selenium pliego URLs encontrados: {len(pliego_map)}")
                    if pliego_map:
                        for entry in row_entries:
                            if entry.get("numero") in pliego_map:
                                entry["pliego_url"] = pliego_map[entry["numero"]]

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
            disable_date_filter = self.config.selectors.get("disable_date_filter", True)
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
                if apertura and not opening_date:
                    logger.warning(f"Could not parse apertura '{apertura}' for {numero}")
                # Use scraping time, NOT opening_date (apertura is future)
                publication_date = datetime.utcnow()

                pliego_url = entry.get("pliego_url")
                if pliego_url and not pliego_url.startswith(("http://", "https://")):
                    pliego_url = None

                # ComprasElectronicas URL as fallback
                compras_url = entry.get("compras_url")
                if compras_url and not compras_url.startswith(("http://", "https://")):
                    compras_url = None

                pliego_fields: Dict[str, str] = {}
                detail_url_used = None

                # Try PLIEGO first, then ComprasElectronicas
                if pliego_url:
                    pliego_html = await self.fetch_page(pliego_url)
                    if pliego_html:
                        pliego_fields = self._parse_pliego_fields(pliego_html)
                        detail_url_used = pliego_url
                elif compras_url:
                    # Fallback: try ComprasElectronicas URL
                    compras_html = await self.fetch_page(compras_url)
                    if compras_html:
                        pliego_fields = self._parse_pliego_fields(compras_html)
                        detail_url_used = compras_url

                # Build metadata (store raw apertura for debugging/backfill)
                meta = {
                    "comprar_list_url": list_url,
                    "comprar_target": target,
                    "comprar_estado": estado,
                    "comprar_unidad_ejecutora": unidad,
                    "comprar_servicio_admin": servicio_admin,
                    "comprar_pliego_url": pliego_url,
                    "comprar_compras_url": compras_url,  # Fallback direct URL
                    "comprar_detail_url_used": detail_url_used,  # URL used for data extraction
                    "comprar_pliego_fields": pliego_fields,
                    "comprar_apertura_raw": apertura,
                }

                # Build proxy URLs (only if api_base is a valid absolute URL)
                proxy_open_url = None
                proxy_html_url = None
                if target and api_base and api_base.startswith(("http://", "https://")):
                    proxy_open_url = f"{api_base}/api/comprar/proceso/open?list_url={quote_plus(list_url)}&target={quote_plus(target)}"
                    proxy_html_url = f"{api_base}/api/comprar/proceso/html?list_url={quote_plus(list_url)}&target={quote_plus(target)}"

                # Determine canonical URL and quality
                # Priority: PLIEGO URL > ComprasElectronicas URL > Proxy URL > List URL
                canonical_url = None
                url_quality = "partial"
                source_urls = {}

                if pliego_url:
                    canonical_url = pliego_url
                    url_quality = "direct"
                    source_urls["comprar_pliego"] = pliego_url
                elif compras_url:
                    canonical_url = compras_url
                    url_quality = "direct"
                    source_urls["comprar_compras"] = compras_url
                elif proxy_open_url:
                    canonical_url = proxy_open_url
                    url_quality = "proxy"
                
                # Always include list URL as source
                source_urls["comprar_list"] = list_url
                if proxy_open_url:
                    source_urls["comprar_proxy"] = proxy_open_url
                if proxy_html_url:
                    source_urls["comprar_detail"] = proxy_html_url

                # Extract fields from PLIEGO
                description = title
                expedient_number = None
                contact = None
                currency = None
                budget = None

                # Cronograma dates
                fecha_publicacion_portal = None
                fecha_inicio_consultas = None
                fecha_fin_consultas = None
                fecha_apertura = opening_date

                # Info adicional
                etapa = None
                modalidad = None
                alcance = None
                encuadre_legal = None
                tipo_cotizacion = None
                tipo_adjudicacion = None
                plazo_mantenimiento_oferta = None
                requiere_pago = None
                duracion_contrato = None
                fecha_inicio_contrato = None
                items = []

                if pliego_fields:
                    expedient_number = pliego_fields.get("Número de expediente") or pliego_fields.get("Número de Expediente")
                    description = pliego_fields.get("Objeto de la contratación") or pliego_fields.get("Objeto") or description
                    currency = pliego_fields.get("Moneda")
                    contact = pliego_fields.get("Lugar de recepción de documentación física")

                    # Budget - try multiple known label variations
                    for bl in ["Presupuesto oficial", "Presupuesto estimado", "Presupuesto",
                               "Monto estimado", "Monto total", "Importe total",
                               "Valor estimado", "Precio referencial"]:
                        budget_raw = pliego_fields.get(bl)
                        if budget_raw:
                            clean = budget_raw.replace("$", "").replace(".", "").replace(",", ".").strip()
                            bm = re.search(r"[\d.]+", clean)
                            if bm:
                                try:
                                    budget = float(bm.group())
                                    if budget <= 0:
                                        budget = None
                                except ValueError:
                                    pass
                            break

                    # CRONOGRAMA - Fechas críticas
                    pub_portal_raw = pliego_fields.get("Fecha y hora estimada de publicación en el portal")
                    if pub_portal_raw:
                        fecha_publicacion_portal = parse_date_guess(pub_portal_raw)

                    inicio_consultas_raw = pliego_fields.get("Fecha y hora inicio de consultas")
                    if inicio_consultas_raw:
                        fecha_inicio_consultas = parse_date_guess(inicio_consultas_raw)

                    fin_consultas_raw = pliego_fields.get("Fecha y hora final de consultas")
                    if fin_consultas_raw:
                        fecha_fin_consultas = parse_date_guess(fin_consultas_raw)

                    apertura_raw = pliego_fields.get("Fecha y hora acto de apertura") or pliego_fields.get("Fecha de Apertura")
                    if apertura_raw:
                        fecha_apertura = parse_date_guess(apertura_raw)

                    # INFO BÁSICA ADICIONAL
                    etapa = pliego_fields.get("Etapa")
                    modalidad = pliego_fields.get("Modalidad")
                    alcance = pliego_fields.get("Alcance")
                    encuadre_legal = pliego_fields.get("Encuadre legal")
                    tipo_cotizacion = pliego_fields.get("Tipo de cotización")
                    tipo_adjudicacion = pliego_fields.get("Tipo de adjudicación")
                    plazo_mantenimiento_oferta = pliego_fields.get("Plazo mantenimiento de la oferta")
                    requiere_pago_raw = pliego_fields.get("Requiere pago")
                    if requiere_pago_raw:
                        requiere_pago = requiere_pago_raw.lower() in ("sí", "si", "yes", "true", "1")

                    # INFO DEL CONTRATO
                    duracion_contrato = pliego_fields.get("Duración del contrato")
                    fecha_inicio_contrato = pliego_fields.get("Fecha estimada del inicio del contrato")

                    # ITEMS (productos/servicios)
                    items = pliego_fields.get("_items", [])

                    # Fallback budget: sum item prices if no label-based budget found
                    if not budget and items:
                        total_sum = 0
                        for it in items:
                            precio_str = it.get("precio_total") or it.get("precio_unitario", "")
                            if precio_str:
                                pc = precio_str.replace("$", "").replace(".", "").replace(",", ".").strip()
                                pm = re.search(r"[\d.]+", pc)
                                if pm:
                                    try:
                                        total_sum += float(pm.group())
                                    except ValueError:
                                        pass
                        if total_sum > 0:
                            budget = total_sum

                    # SOLICITUDES DE CONTRATACIÓN
                    solicitudes_contratacion = pliego_fields.get("_solicitudes", [])

                    # PLIEGOS DE BASES Y CONDICIONES
                    pliegos_bases = pliego_fields.get("_pliegos_bases", [])

                    # REQUISITOS MÍNIMOS DE PARTICIPACIÓN
                    requisitos_participacion = pliego_fields.get("_requisitos_participacion", [])

                    # ACTOS ADMINISTRATIVOS
                    actos_administrativos = pliego_fields.get("_actos_administrativos", [])

                    # CIRCULARES
                    circulares = pliego_fields.get("_circulares", [])
                else:
                    solicitudes_contratacion = []
                    pliegos_bases = []
                    requisitos_participacion = []
                    actos_administrativos = []
                    circulares = []

                # Update opening_date if we got it from pliego
                if fecha_apertura:
                    opening_date = fecha_apertura

                # Compute content hash for deduplication
                content_hash = hashlib.md5(
                    f"{title.lower().strip()}|{servicio_admin or unidad or ''}|{publication_date.strftime('%Y%m%d')}".encode()
                ).hexdigest()

                lic = LicitacionCreate(**{
                    "title": title,
                    "organization": servicio_admin or unidad or "Gobierno de Mendoza",
                    "publication_date": publication_date,
                    "opening_date": opening_date,
                    "expedient_number": expedient_number,
                    "licitacion_number": numero,
                    "description": description,
                    "contact": contact,
                    "source_url": pliego_url or proxy_open_url or list_url,
                    "canonical_url": canonical_url,
                    "source_urls": source_urls,
                    "url_quality": url_quality,
                    "content_hash": content_hash,
                    "status": "active" if not estado else ("active" if "publicado" in estado.lower() else "active"),
                    "location": "Mendoza",
                    "attached_files": [],
                    "id_licitacion": numero or str(uuid.uuid4()),
                    "jurisdiccion": "Mendoza",
                    "tipo_procedimiento": tipo,
                    "tipo_acceso": "COMPR.AR",
                    "fecha_scraping": datetime.utcnow(),
                    "fuente": "COMPR.AR Mendoza",
                    "currency": currency,
                    "budget": budget,
                    # CRONOGRAMA - Fechas críticas
                    "fecha_publicacion_portal": fecha_publicacion_portal,
                    "fecha_inicio_consultas": fecha_inicio_consultas,
                    "fecha_fin_consultas": fecha_fin_consultas,
                    # INFO ADICIONAL
                    "etapa": etapa,
                    "modalidad": modalidad,
                    "alcance": alcance,
                    "encuadre_legal": encuadre_legal,
                    "tipo_cotizacion": tipo_cotizacion,
                    "tipo_adjudicacion": tipo_adjudicacion,
                    "plazo_mantenimiento_oferta": plazo_mantenimiento_oferta,
                    "requiere_pago": requiere_pago,
                    "duracion_contrato": duracion_contrato,
                    "fecha_inicio_contrato": fecha_inicio_contrato,
                    "items": items,
                    "solicitudes_contratacion": solicitudes_contratacion,
                    "pliegos_bases": pliegos_bases,
                    "requisitos_participacion": requisitos_participacion,
                    "actos_administrativos": actos_administrativos,
                    "circulares": circulares,
                    "metadata": {
                        **meta,
                        "comprar_open_url": proxy_open_url,
                        "comprar_detail_url": proxy_html_url,
                    },
                })

                if lic.id_licitacion in seen_ids:
                    continue
                if disable_date_filter:
                    licitaciones.append(lic)
                    seen_ids.add(lic.id_licitacion)
                else:
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
