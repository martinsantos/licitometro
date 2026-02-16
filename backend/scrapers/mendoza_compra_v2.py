"""
Mendoza Compra Scraper v2 - Optimizado para captura masiva de URLs PLIEGO.

Mejoras:
- Caché de URLs PLIEGO persistido en MongoDB
- Múltiples estrategias de extracción de URLs
- Reintentos con backoff exponencial
- Mejor manejo de paginación
- Detección de diferentes tipos de URLs de proceso
"""

from typing import List, Dict, Any, Optional
import asyncio
import logging
from bs4 import BeautifulSoup
from urllib.parse import urljoin, quote_plus
from datetime import datetime, timedelta
import re
import uuid
import sys
import hashlib
import json
from pathlib import Path
import os
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, StaleElementReferenceException

# Add parent directory to path so we can import modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper
from utils.dates import parse_date_guess, last_business_days_set

logger = logging.getLogger("scraper.mendoza_compra_v2")


class PliegoURLCache:
    """Cache for PLIEGO URLs to avoid recalculating"""
    
    CACHE_FILE = Path("storage/pliego_url_cache.json")
    CACHE_TTL_HOURS = 24
    
    def __init__(self):
        self.cache: Dict[str, Dict[str, Any]] = {}
        self._load()
    
    def _load(self):
        """Load cache from disk"""
        if self.CACHE_FILE.exists():
            try:
                with open(self.CACHE_FILE, 'r', encoding='utf-8') as f:
                    self.cache = json.load(f)
                logger.info(f"Loaded {len(self.cache)} cached PLIEGO URLs")
            except Exception as e:
                logger.error(f"Error loading cache: {e}")
                self.cache = {}
    
    def _save(self):
        """Save cache to disk"""
        try:
            self.CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(self.CACHE_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.cache, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Error saving cache: {e}")
    
    def get(self, process_number: str) -> Optional[str]:
        """Get cached URL if not expired"""
        if process_number not in self.cache:
            return None
        
        entry = self.cache[process_number]
        cached_time = datetime.fromisoformat(entry['timestamp'])
        
        # Check if expired
        if datetime.utcnow() - cached_time > timedelta(hours=self.CACHE_TTL_HOURS):
            del self.cache[process_number]
            return None
        
        return entry.get('url')
    
    def set(self, process_number: str, url: str, url_type: str = "unknown"):
        """Cache a URL"""
        self.cache[process_number] = {
            'url': url,
            'type': url_type,
            'timestamp': datetime.utcnow().isoformat()
        }
        self._save()
    
    def get_stats(self) -> Dict[str, int]:
        """Get cache statistics"""
        return {
            'total_cached': len(self.cache),
            'by_type': {}
        }


class MendozaCompraScraperV2(BaseScraper):
    """Enhanced scraper for Mendoza Compra with PLIEGO URL caching"""
    
    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self.url_cache = PliegoURLCache()
        self.stats = {
            'processed': 0,
            'pliego_urls_found': 0,
            'cache_hits': 0,
            'cache_misses': 0,
        }
    
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

            # Parse dates from HTML
            pub_raw = value_by_label(["Fecha y hora estimada de publicación en el portal", "Fecha de publicación"])
            pub_date_parsed = parse_date_guess(pub_raw) if pub_raw else None

            open_raw = value_by_label(["Fecha y hora acto de apertura", "Fecha de Apertura"])
            opening_date_parsed = parse_date_guess(open_raw) if open_raw else None

            # Extract attached files BEFORE date resolution (needed for fallback date extraction)
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
            
            source_url = url
            if licitacion_number:
                source_url = f"{url}#proceso={licitacion_number}"
            
            # Compute estado
            estado = self._compute_estado(publication_date, opening_date, fecha_prorroga=None)

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
                "estado": estado,
                "fecha_prorroga": None,
            }

            return LicitacionCreate(**licitacion_data)
        
        except Exception as e:
            logger.error(f"Error extracting licitacion data from {url}: {e}")
            return None

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

    def _extract_pager_args(self, html: str) -> Dict[str, List[str]]:
        """Extract paging args for grids"""
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
        for k, v in list(pages.items()):
            pages[k] = list(dict.fromkeys(v))
        return pages

    def _extract_pliego_url_from_detail(self, html: str, base_url: str) -> Optional[str]:
        """Extract PLIEGO URL from detail page HTML"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Strategy 1: Direct link to VistaPreviaPliegoCiudadano
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            if 'VistaPreviaPliegoCiudadano.aspx?qs=' in href:
                return urljoin(base_url, href)
        
        # Strategy 2: Link in onclick handlers
        for elem in soup.find_all(onclick=True):
            onclick = elem.get('onclick', '')
            m = re.search(r"window\.open\(['\"]([^'\"]+VistaPreviaPliegoCiudadano[^'\"]*)['\"]", onclick)
            if m:
                return urljoin(base_url, m.group(1))
        
        # Strategy 3: Raw search in HTML for encoded URLs
        patterns = [
            r'(PLIEGO[/\\]VistaPreviaPliegoCiudadano\.aspx\?qs=[^\s\"\'<>]+)',
            r'(ComprasElectronicas\.aspx\?qs=[^\s\"\'<>]+)',
        ]
        for pattern in patterns:
            m = re.search(pattern, html, re.IGNORECASE)
            if m:
                url = m.group(1).replace('\\/', '/')
                return urljoin(base_url, url)
        
        return None

    def _try_extract_url_from_js(self, driver, numero: str) -> Optional[str]:
        """Try to extract PLIEGO URL from JavaScript functions without clicking"""
        try:
            # Execute JavaScript to find URL patterns in the page
            script = """
                // Look for URL patterns in all script tags
                var scripts = document.getElementsByTagName('script');
                var urls = [];
                for (var i = 0; i < scripts.length; i++) {
                    var text = scripts[i].text || '';
                    // Look for VistaPreviaPliegoCiudadano URLs
                    var matches = text.match(/VistaPreviaPliegoCiudadano\.aspx\?qs=[^&"'\s]+/g);
                    if (matches) {
                        urls = urls.concat(matches);
                    }
                }
                // Also check for onclick handlers on links
                var links = document.querySelectorAll('a[onclick*="VistaPreviaPliego"]');
                links.forEach(function(link) {
                    var onclick = link.getAttribute('onclick') || '';
                    var match = onclick.match(/VistaPreviaPliegoCiudadano\.aspx\?qs=[^&"'\s]+/);
                    if (match) {
                        urls.push(match[0]);
                    }
                });
                return urls;
            """
            urls = driver.execute_script(script)
            if urls and len(urls) > 0:
                # Return first found URL
                return urls[0] if isinstance(urls, list) else urls
        except Exception as e:
            logger.debug(f"JS extraction failed: {e}")
        return None

    def _collect_pliego_urls_selenium_v2(self, list_url: str, max_pages: int = 9) -> Dict[str, str]:
        """
        Enhanced Selenium collection with caching and multiple strategies.
        V2.1: Added JavaScript URL extraction for better coverage.
        """
        mapping: Dict[str, str] = {}
        
        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        
        try:
            driver = webdriver.Chrome(options=options)
            # Remove webdriver property to avoid detection
            driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        except Exception as exc:
            logger.error(f"Selenium not available: {exc}")
            return mapping

        try:
            logger.info(f"Starting Selenium collection from {list_url}")
            driver.get(list_url)
            
            # Wait for table
            WebDriverWait(driver, 20).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima"))
            )
            
            # First, try to extract all URLs from JavaScript without clicking
            logger.info("Attempting JavaScript URL extraction...")
            js_urls = self._try_extract_url_from_js(driver, "")
            if js_urls:
                logger.info(f"Found {len(js_urls)} URLs via JavaScript")
            
            current_page = 1
            processed_numbers = set()
            
            while current_page <= max_pages:
                logger.info(f"Processing page {current_page}")
                
                # Get all process numbers on this page
                rows = driver.find_elements(By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima tr")
                page_numbers = []
                
                for row in rows:
                    try:
                        cells = row.find_elements(By.TAG_NAME, "td")
                        if len(cells) < 6:
                            continue
                        
                        num_cell = cells[0]
                        num_link = num_cell.find_element(By.TAG_NAME, "a")
                        numero = (num_link.text or num_link.get_attribute("textContent") or "").strip()
                        
                        if numero and numero not in processed_numbers:
                            # Also get the onclick or href attribute for later analysis
                            onclick_attr = num_link.get_attribute('onclick') or ''
                            href_attr = num_link.get_attribute('href') or ''
                            page_numbers.append((numero, num_link, onclick_attr, href_attr))
                            processed_numbers.add(numero)
                    except Exception as e:
                        continue
                
                logger.info(f"Found {len(page_numbers)} processes on page {current_page}")
                
                # Process each number
                for idx, (numero, num_link, onclick_attr, href_attr) in enumerate(page_numbers):
                    # Check cache first
                    cached_url = self.url_cache.get(numero)
                    if cached_url:
                        mapping[numero] = cached_url
                        self.stats['cache_hits'] += 1
                        continue
                    
                    self.stats['cache_misses'] += 1
                    
                    # Strategy 1: Try to extract URL from onclick attribute
                    if onclick_attr:
                        # Look for URL in onclick
                        m = re.search(r'(VistaPreviaPliegoCiudadano\.aspx\?qs=[^&"\'\s]+)', onclick_attr)
                        if m:
                            url = f"https://comprar.mendoza.gov.ar/PLIEGO/{m.group(1)}"
                            mapping[numero] = url
                            self.url_cache.set(numero, url, "pliego")
                            self.stats['pliego_urls_found'] += 1
                            if idx < 3:
                                logger.info(f"Found URL from onclick for {numero}: {url}")
                            continue
                    
                    # Strategy 2: Try to get URL via navigation
                    try:
                        # Scroll into view
                        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", num_link)
                        time.sleep(0.3)
                        
                        # Click
                        prev_url = driver.current_url
                        driver.execute_script("arguments[0].click();", num_link)
                        
                        # Wait for navigation
                        try:
                            WebDriverWait(driver, 10).until(EC.url_changes(prev_url))
                        except TimeoutException:
                            # Sometimes the page doesn't navigate, try regular click
                            num_link.click()
                            WebDriverWait(driver, 10).until(EC.url_changes(prev_url))
                        
                        # Give it a moment to settle
                        time.sleep(0.5)
                        
                        current_url = driver.current_url
                        
                        # Check if we got a good URL
                        if current_url and "comprar.mendoza.gov.ar" in current_url:
                            if "Compras.aspx?qs=" not in current_url:
                                # Good URL!
                                url_type = "unknown"
                                if "VistaPreviaPliegoCiudadano" in current_url:
                                    url_type = "pliego"
                                elif "ComprasElectronicas" in current_url:
                                    url_type = "electronicas"
                                
                                mapping[numero] = current_url
                                self.url_cache.set(numero, current_url, url_type)
                                self.stats['pliego_urls_found'] += 1
                                
                                if idx < 3:
                                    logger.info(f"Found URL via navigation for {numero}: {current_url}")
                        
                        # Go back to list
                        driver.get(list_url)
                        WebDriverWait(driver, 20).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima"))
                        )
                        
                        # Navigate back to current page if needed
                        if current_page > 1:
                            self._goto_page_selenium(driver, current_page)
                        
                    except Exception as e:
                        logger.warning(f"Error processing {numero}: {e}")
                        # Try to recover
                        try:
                            driver.get(list_url)
                            WebDriverWait(driver, 20).until(
                                EC.presence_of_element_located((By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima"))
                            )
                        except:
                            pass
                
                # Next page
                if current_page >= max_pages:
                    break
                
                if not self._goto_page_selenium(driver, current_page + 1):
                    break
                
                current_page += 1
                
        except Exception as e:
            logger.error(f"Error in Selenium collection: {e}")
        finally:
            driver.quit()
        
        logger.info(f"Selenium collection complete. Found {len(mapping)} URLs. "
                   f"Cache hits: {self.stats['cache_hits']}, misses: {self.stats['cache_misses']}")
        return mapping
    
    def _goto_page_selenium(self, driver, page_num: int) -> bool:
        """Navigate to a specific page using Selenium"""
        try:
            # Find page link
            page_link = driver.find_element(By.LINK_TEXT, str(page_num))
            driver.execute_script("arguments[0].scrollIntoView(true);", page_link)
            driver.execute_script("arguments[0].click();", page_link)
            
            # Wait for table to update
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima"))
            )
            
            # Small delay to ensure page is ready
            time.sleep(1)
            return True
        except Exception as e:
            logger.warning(f"Could not navigate to page {page_num}: {e}")
            return False

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
            
            logger.info(f"Starting MendozaCompraScraperV2 with URL: {base_url}")
            logger.info(f"Cache stats: {self.url_cache.get_stats()}")
            
            # Get list URLs from config or homepage
            list_urls = []
            cfg_urls = self.config.pagination.get("list_urls") if self.config.pagination else None
            if cfg_urls:
                list_urls.extend(cfg_urls if isinstance(cfg_urls, list) else [cfg_urls])
            
            if not list_urls:
                logger.error("No list URLs configured")
                return []
            
            row_entries: List[Dict[str, Any]] = []
            max_pages = int(self.config.selectors.get("max_pages", 20))
            
            # Process each list URL
            for list_url in list_urls:
                logger.info(f"Processing list: {list_url}")
                list_html = await self.fetch_page(list_url)
                if not list_html:
                    continue
                
                # Get rows from first page
                rows = self._extract_rows_from_list(list_html)
                logger.info(f"Found {len(rows)} rows on first page")
                
                list_fields = self._extract_hidden_fields(list_html)
                
                # Get all pages
                pager_args = self._extract_pager_args(list_html)
                grid_targets = list(pager_args.keys())
                
                all_rows = list(rows)  # Copy first page rows
                
                # Navigate through pages
                if grid_targets and max_pages > 1:
                    grid_target = grid_targets[0]
                    page_args = pager_args.get(grid_target, [])[:max_pages-1]
                    
                    for page_arg in page_args:
                        fields = dict(list_fields)
                        fields["__EVENTTARGET"] = grid_target
                        fields["__EVENTARGUMENT"] = page_arg
                        
                        next_html = await self._postback(list_url, fields)
                        if next_html:
                            page_rows = self._extract_rows_from_list(next_html)
                            all_rows.extend(page_rows)
                            await asyncio.sleep(self.config.wait_time)
                
                logger.info(f"Total rows from all pages: {len(all_rows)}")
                
                # Process each row
                for row in all_rows:
                    detail_html = None
                    pliego_url = None
                    
                    if row.get("target"):
                        detail_fields = dict(list_fields)
                        detail_fields["__EVENTTARGET"] = row["target"]
                        detail_fields["__EVENTARGUMENT"] = ""
                        detail_html = await self._postback(list_url, detail_fields)
                        await asyncio.sleep(self.config.wait_time)
                        
                        if detail_html:
                            pliego_url = self._extract_pliego_url_from_detail(detail_html, base_url)
                    
                    # Check cache for this process number
                    if not pliego_url and row.get("numero"):
                        cached_url = self.url_cache.get(row["numero"])
                        if cached_url:
                            pliego_url = cached_url
                            self.stats['cache_hits'] += 1
                    
                    row_entries.append({
                        **row,
                        "list_url": list_url,
                        "pliego_url": pliego_url,
                    })
                
                # Use Selenium to collect more PLIEGO URLs
                if self.config.selectors.get("use_selenium_pliego", True):
                    selenium_max_pages = int(self.config.selectors.get("selenium_max_pages", 9))
                    pliego_map = self._collect_pliego_urls_selenium_v2(list_url, max_pages=selenium_max_pages)
                    
                    logger.info(f"Selenium found {len(pliego_map)} PLIEGO URLs")
                    
                    # Merge with existing entries
                    for entry in row_entries:
                        if entry.get("numero") in pliego_map:
                            entry["pliego_url"] = pliego_map[entry["numero"]]
            
            # Build Licitacion objects
            api_base = self.config.selectors.get("api_base_url") or os.getenv("API_BASE_URL", "")
            disable_date_filter = self.config.selectors.get("disable_date_filter", True)
            
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
                
                opening_date_parsed = parse_date_guess(apertura) if apertura else None
                if apertura and not opening_date_parsed:
                    logger.warning(f"Could not parse apertura '{apertura}' for {numero}")

                # VIGENCIA MODEL: Resolve dates with multi-source fallback
                # COMPR.AR grid has no real publication date in list view
                publication_date = self._resolve_publication_date(
                    parsed_date=None,  # No pub date in grid
                    title=title,
                    description=title,  # Use title as description for year extraction
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
                
                pliego_url = entry.get("pliego_url")
                if pliego_url and not pliego_url.startswith(("http://", "https://")):
                    pliego_url = None
                
                # Get PLIEGO fields if we have URL
                pliego_fields: Dict[str, str] = {}
                if pliego_url:
                    pliego_html = await self.fetch_page(pliego_url)
                    if pliego_html:
                        soup = BeautifulSoup(pliego_html, 'html.parser')
                        for lab in soup.find_all('label'):
                            key = lab.get_text(' ', strip=True)
                            if not key:
                                continue
                            nxt = lab.find_next_sibling()
                            val = nxt.get_text(' ', strip=True) if nxt else ''
                            if val:
                                pliego_fields[key] = val
                
                # Build metadata (store raw apertura for debugging/backfill)
                meta = {
                    "comprar_list_url": list_url,
                    "comprar_target": target,
                    "comprar_estado": estado,
                    "comprar_unidad_ejecutora": unidad,
                    "comprar_servicio_admin": servicio_admin,
                    "comprar_pliego_url": pliego_url,
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
                canonical_url = None
                url_quality = "partial"
                source_urls = {}
                
                if pliego_url:
                    canonical_url = pliego_url
                    url_quality = "direct"
                    source_urls["comprar_pliego"] = pliego_url
                elif proxy_open_url:
                    canonical_url = proxy_open_url
                    url_quality = "proxy"
                
                source_urls["comprar_list"] = list_url
                if proxy_open_url:
                    source_urls["comprar_proxy"] = proxy_open_url
                if proxy_html_url:
                    source_urls["comprar_detail"] = proxy_html_url
                
                # Extract fields
                description = title
                expedient_number = None
                contact = None
                currency = None
                budget = None
                
                objeto = None
                if pliego_fields:
                    expedient_number = pliego_fields.get("Número de expediente") or pliego_fields.get("Número de Expediente")
                    description = pliego_fields.get("Objeto de la contratación") or pliego_fields.get("Objeto") or description
                    objeto = pliego_fields.get("Objeto de la contratación") or pliego_fields.get("Objeto")
                    currency = pliego_fields.get("Moneda")
                    contact = pliego_fields.get("Lugar de recepción de documentación física")
                    # Promote descriptive name to title (instead of process number)
                    nombre_desc = pliego_fields.get("Nombre descriptivo del proceso") or pliego_fields.get("Nombre descriptivo de proceso")
                    if nombre_desc and len(nombre_desc.strip()) > 10:
                        title = nombre_desc.strip()
                
                # Compute content hash (handle None publication_date)
                content_hash = hashlib.md5(
                    f"{title.lower().strip()}|{servicio_admin or unidad or ''}|{publication_date.strftime('%Y%m%d') if publication_date else 'unknown'}".encode()
                ).hexdigest()

                # Compute estado
                estado = self._compute_estado(publication_date, opening_date, fecha_prorroga=None)

                lic = LicitacionCreate(**{
                    "title": title,
                    "organization": servicio_admin or unidad or "Gobierno de Mendoza",
                    "publication_date": publication_date,
                    "opening_date": opening_date,
                    "expedient_number": expedient_number,
                    "licitacion_number": numero,
                    "description": description,
                    "objeto": objeto,
                    "contact": contact,
                    "source_url": pliego_url or proxy_open_url or list_url,
                    "canonical_url": canonical_url,
                    "source_urls": source_urls,
                    "url_quality": url_quality,
                    "content_hash": content_hash,
                    "status": "active",
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
                    "estado": estado,
                    "fecha_prorroga": None,
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
                
                if self.config.max_items and len(licitaciones) >= self.config.max_items:
                    break
            
            # Sort by publication date
            licitaciones.sort(key=lambda l: l.publication_date, reverse=True)
            
            logger.info(f"Scraper complete. Total: {len(licitaciones)}, "
                       f"Direct URLs: {sum(1 for l in licitaciones if l.url_quality == 'direct')}, "
                       f"Proxy URLs: {sum(1 for l in licitaciones if l.url_quality == 'proxy')}")
            
            return licitaciones
            
        finally:
            await self.cleanup()
    
    async def extract_links(self, html: str) -> List[str]:
        """Extract links to licitacion pages - not used in this scraper"""
        return []
    
    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        """Get the URL of the next page - not used in this scraper"""
        return None
