"""
Mendoza Compra Scraper v2 - HTTP-only, no Selenium.

Optimized for speed: list + pagination + detail postbacks + parallel pliego fetch.
Target: <3 minutes for ~100 items (vs 15 min with Selenium).

Strategies for pliego URL extraction (in order):
1. Cache lookup (7-day TTL)
2. Direct link in detail postback HTML (<a href="VistaPreviaPliego...">)
3. onclick handlers (window.open patterns)
4. Raw HTML regex scan for VistaPreviaPliegoCiudadano.aspx?qs=
5. Hidden input fields (ASP.NET/GeneXus embed URLs)
6. Inline <script> tags
7. <iframe src> embeds
8. Follow redirect: ComprasElectronicas → fetch → scan for VistaPreviaPliego link
"""

from typing import List, Dict, Any, Optional
import asyncio
import logging
from bs4 import BeautifulSoup
from urllib.parse import urljoin, quote_plus
from datetime import datetime, timedelta
from utils.time import utc_now
import re
import uuid
import sys
import hashlib
import json
from pathlib import Path
import os

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
    CACHE_TTL_HOURS = 168  # 7 days — pliego URLs are stable

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
        if cached_time.tzinfo is None:
            from datetime import timezone
            cached_time = cached_time.replace(tzinfo=timezone.utc)

        if utc_now() - cached_time > timedelta(hours=self.CACHE_TTL_HOURS):
            del self.cache[process_number]
            return None

        return entry.get('url')

    def set(self, process_number: str, url: str, url_type: str = "unknown"):
        """Cache a URL"""
        self.cache[process_number] = {
            'url': url,
            'type': url_type,
            'timestamp': utc_now().isoformat()
        }
        self._save()

    def get_stats(self) -> Dict[str, int]:
        """Get cache statistics"""
        return {
            'total_cached': len(self.cache),
        }


class MendozaCompraScraperV2(BaseScraper):
    """HTTP-only scraper for Mendoza Compra with PLIEGO URL caching."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self.url_cache = PliegoURLCache()
        self.stats = {
            'processed': 0,
            'pliego_urls_found': 0,
            'cache_hits': 0,
            'cache_misses': 0,
            'redirect_resolved': 0,
        }

    # ------------------------------------------------------------------
    # Pliego URL extraction — multiple strategies, no Selenium
    # ------------------------------------------------------------------

    def _extract_pliego_url_from_detail(self, html: str, base_url: str) -> Optional[str]:
        """Extract PLIEGO URL from detail page HTML using multiple strategies."""
        if not html:
            return None

        soup = BeautifulSoup(html, 'html.parser')

        # Strategy 1: Direct <a href> to VistaPreviaPliegoCiudadano
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            if 'VistaPreviaPliegoCiudadano.aspx?qs=' in href:
                return urljoin(base_url, href)

        # Strategy 2: onclick handlers (window.open patterns)
        for elem in soup.find_all(onclick=True):
            onclick = elem.get('onclick', '')
            m = re.search(r"window\.open\(['\"]([^'\"]+VistaPreviaPliegoCiudadano[^'\"]*)['\"]", onclick)
            if m:
                return urljoin(base_url, m.group(1))

        # Strategy 3: Hidden input fields (ASP.NET/GeneXus embed URLs in hidden fields)
        for inp in soup.find_all('input', {'type': 'hidden'}):
            val = inp.get('value', '')
            if 'VistaPreviaPliegoCiudadano.aspx?qs=' in val:
                m = re.search(r'((?:PLIEGO/)?VistaPreviaPliegoCiudadano\.aspx\?qs=[^\s"\'<>&]+)', val)
                if m:
                    return urljoin(base_url, m.group(1))

        # Strategy 4: Inline <script> tags (window.open, location.href, etc.)
        for script in soup.find_all('script'):
            text = script.string or ''
            m = re.search(r'((?:PLIEGO/)?VistaPreviaPliegoCiudadano\.aspx\?qs=[^\s"\'<>&]+)', text)
            if m:
                return urljoin(base_url, m.group(1))

        # Strategy 5: <iframe src> embeds
        for iframe in soup.find_all('iframe', src=True):
            src = iframe.get('src', '')
            if 'VistaPreviaPliegoCiudadano.aspx?qs=' in src:
                return urljoin(base_url, src)

        # Strategy 6: Raw regex scan of entire HTML
        patterns = [
            r'((?:PLIEGO/)?VistaPreviaPliegoCiudadano\.aspx\?qs=[^\s"\'<>&]+)',
            r'(ComprasElectronicas\.aspx\?qs=[^\s"\'<>&]+)',
        ]
        for pattern in patterns:
            m = re.search(pattern, html, re.IGNORECASE)
            if m:
                url = m.group(1).replace('\\/', '/')
                return urljoin(base_url, url)

        return None

    async def _resolve_compras_electronicas(self, url: str) -> Optional[str]:
        """Follow a ComprasElectronicas URL and try to find a stable VistaPreviaPliego link."""
        try:
            html = await self.fetch_page(url)
            if not html:
                return None
            # Search the rendered page for VistaPreviaPliegoCiudadano link
            m = re.search(
                r'((?:PLIEGO/)?VistaPreviaPliegoCiudadano\.aspx\?qs=[^\s"\'<>&]+)',
                html, re.IGNORECASE,
            )
            if m:
                return urljoin(url, m.group(1))
        except Exception as e:
            logger.debug(f"ComprasElectronicas resolution failed: {e}")
        return None

    async def _fetch_and_parse_pliego(self, pliego_url: str, numero: str) -> tuple:
        """Fetch pliego page and extract label-value fields in parallel-safe way.
        Returns (fields_dict, updated_pliego_url)."""
        if not pliego_url:
            return {}, pliego_url

        pliego_html = await self.fetch_page(pliego_url)
        if not pliego_html:
            return {}, pliego_url

        soup = BeautifulSoup(pliego_html, 'html.parser')
        labels = soup.find_all('label')

        # If no labels and URL is session-dependent ComprasElectronicas,
        # try to find stable VistaPreviaPliegoCiudadano link
        if not labels and "ComprasElectronicas" in pliego_url:
            pliego_link = self._extract_pliego_url_from_detail(pliego_html, pliego_url)
            if pliego_link and "VistaPreviaPliegoCiudadano" in pliego_link:
                logger.info(f"Resolved ComprasElectronicas → VistaPreviaPliego for {numero}")
                pliego_url = pliego_link
                pliego_html = await self.fetch_page(pliego_url)
                if pliego_html:
                    soup = BeautifulSoup(pliego_html, 'html.parser')
                    labels = soup.find_all('label')

        fields = {}
        for lab in (labels or []):
            key = lab.get_text(' ', strip=True)
            if not key:
                continue
            nxt = lab.find_next_sibling()
            val = nxt.get_text(' ', strip=True) if nxt else ''
            if val:
                fields[key] = val

        return fields, pliego_url

    # ------------------------------------------------------------------
    # Detail page extraction (from label-value pliego page)
    # ------------------------------------------------------------------

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
                        "type": href.split('.')[-1].lower() if '.' in href else "unknown"
                    })

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
                "fecha_scraping": utc_now(),
                "fuente": "COMPR.AR Mendoza",
                "estado": estado,
                "fecha_prorroga": None,
            }

            return LicitacionCreate(**licitacion_data)

        except Exception as e:
            logger.error(f"Error extracting licitacion data from {url}: {e}")
            return None

    # ------------------------------------------------------------------
    # ASP.NET postback helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _is_pager_row(text: str) -> bool:
        """Detect ASP.NET grid pager rows (e.g. '1 2 3 4 5 6 7 8 9 10')."""
        return bool(re.match(r'^[\d\s.…]+$', text.strip()))

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
            # Skip pager navigation rows (e.g. "1 2 3 4 5 6 7 8 9 10")
            if self._is_pager_row(numero):
                continue
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

    async def _postback(self, url: str, fields: Dict[str, str]) -> Optional[str]:
        try:
            async with self.session.post(str(url), data=fields) as response:
                if response.status < 200 or response.status >= 300:
                    logger.error(f"Postback failed {response.status}")
                    return None
                raw = await response.read()
                encoding = response.charset or "utf-8"
                try:
                    return raw.decode(encoding)
                except (UnicodeDecodeError, LookupError):
                    return raw.decode("latin-1", errors="replace")
        except Exception as e:
            logger.error(f"Postback error: {e}")
            return None

    # ------------------------------------------------------------------
    # Main run — HTTP only
    # ------------------------------------------------------------------

    async def run(self) -> List[LicitacionCreate]:
        await self.setup()
        try:
            licitaciones: List[LicitacionCreate] = []
            base_url = str(self.config.url)

            logger.info(f"Starting MendozaCompraScraperV2 (HTTP-only) with URL: {base_url}")
            logger.info(f"Cache stats: {self.url_cache.get_stats()}")

            # Get list URLs from config
            list_urls = []
            cfg_urls = self.config.pagination.get("list_urls") if self.config.pagination else None
            if cfg_urls:
                list_urls.extend(cfg_urls if isinstance(cfg_urls, list) else [cfg_urls])

            if not list_urls:
                logger.error("No list URLs configured")
                return []

            row_entries: List[Dict[str, Any]] = []
            max_pages = int(self.config.selectors.get("max_pages", 20))

            # Phase 1: Fetch list pages + extract rows via HTTP postback
            for list_url in list_urls:
                logger.info(f"Processing list: {list_url}")
                list_html = await self.fetch_page(list_url)
                if not list_html:
                    continue

                rows = self._extract_rows_from_list(list_html)
                logger.info(f"Found {len(rows)} rows on first page")

                page_fields = self._extract_hidden_fields(list_html)

                # Tag each row with its page's hidden fields for detail postbacks
                all_rows = [(row, dict(page_fields)) for row in rows]

                pager_args = self._extract_pager_args(list_html)
                grid_targets = list(pager_args.keys())

                if grid_targets and max_pages > 1:
                    grid_target = grid_targets[0]
                    page_args = pager_args.get(grid_target, [])[:max_pages-1]

                    for page_arg in page_args:
                        fields = dict(page_fields)
                        fields["__EVENTTARGET"] = grid_target
                        fields["__EVENTARGUMENT"] = page_arg

                        next_html = await self._postback(list_url, fields)
                        if next_html:
                            page_rows = self._extract_rows_from_list(next_html)
                            page_fields = self._extract_hidden_fields(next_html)
                            all_rows.extend((r, dict(page_fields)) for r in page_rows)
                            await asyncio.sleep(self.config.wait_time)

                logger.info(f"Total rows from all pages: {len(all_rows)}")

                # Phase 2: For each row, try to get pliego URL via HTTP detail postback
                for row, row_hidden_fields in all_rows:
                    pliego_url = None
                    numero = row.get("numero", "")

                    # Check cache first
                    cached_url = self.url_cache.get(numero)
                    if cached_url:
                        pliego_url = cached_url
                        self.stats['cache_hits'] += 1
                    elif row.get("target"):
                        self.stats['cache_misses'] += 1
                        # Use the hidden fields from this row's OWN page
                        detail_fields = dict(row_hidden_fields)
                        detail_fields["__EVENTTARGET"] = row["target"]
                        detail_fields["__EVENTARGUMENT"] = ""

                        detail_html = await self._postback(list_url, detail_fields)
                        await asyncio.sleep(self.config.wait_time)

                        if detail_html:
                            pliego_url = self._extract_pliego_url_from_detail(detail_html, base_url)

                            # If we got a ComprasElectronicas URL, try to resolve it
                            if pliego_url and "ComprasElectronicas" in pliego_url and "VistaPreviaPliegoCiudadano" not in pliego_url:
                                resolved = await self._resolve_compras_electronicas(pliego_url)
                                if resolved:
                                    pliego_url = resolved
                                    self.stats['redirect_resolved'] += 1

                            # Cache the result
                            if pliego_url and numero:
                                url_type = "pliego" if "VistaPreviaPliegoCiudadano" in pliego_url else "electronicas"
                                self.url_cache.set(numero, pliego_url, url_type)

                    row_entries.append({
                        **row,
                        "list_url": list_url,
                        "pliego_url": pliego_url,
                    })

            # Phase 3: Parallel pliego fetch for field extraction
            api_base = self.config.selectors.get("api_base_url") or os.getenv("API_BASE_URL", "")
            disable_date_filter = self.config.selectors.get("disable_date_filter", True)

            seen_ids = set()
            pliego_sem = asyncio.Semaphore(5)

            async def _bounded_pliego_fetch(idx, entry):
                url = entry.get("pliego_url")
                if url and not url.startswith(("http://", "https://")):
                    url = None
                async with pliego_sem:
                    return idx, await self._fetch_and_parse_pliego(url, entry.get("numero", ""))

            pliego_tasks = [_bounded_pliego_fetch(i, e) for i, e in enumerate(row_entries)]
            pliego_results = await asyncio.gather(*pliego_tasks, return_exceptions=True)
            pliego_data = {}
            for result in pliego_results:
                if isinstance(result, Exception):
                    logger.warning(f"Pliego fetch error: {result}")
                    continue
                idx, (fields, url) = result
                pliego_data[idx] = (fields, url)

            logger.info(f"Parallel pliego fetch complete: {len(pliego_data)}/{len(row_entries)} successful")

            # Phase 4: Build LicitacionCreate objects
            for entry_idx, entry in enumerate(row_entries):
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

                publication_date = self._resolve_publication_date(
                    parsed_date=None,
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

                # Use pre-fetched pliego data
                pliego_fields, pliego_url = pliego_data.get(entry_idx, ({}, entry.get("pliego_url")))
                is_stable_pliego = pliego_url and "VistaPreviaPliegoCiudadano" in (pliego_url or "")

                meta = {
                    "comprar_list_url": list_url,
                    "comprar_target": target,
                    "comprar_estado": estado,
                    "comprar_unidad_ejecutora": unidad,
                    "comprar_servicio_admin": servicio_admin,
                    "comprar_pliego_url": pliego_url if is_stable_pliego else None,
                    "comprar_pliego_fields": pliego_fields,
                    "comprar_apertura_raw": apertura,
                }

                # Build proxy URLs
                proxy_open_url = None
                proxy_html_url = None
                if target and api_base and api_base.startswith(("http://", "https://")):
                    proxy_open_url = f"{api_base}/api/comprar/proceso/open?list_url={quote_plus(list_url)}&target={quote_plus(target)}"
                    proxy_html_url = f"{api_base}/api/comprar/proceso/html?list_url={quote_plus(list_url)}&target={quote_plus(target)}"

                # Determine canonical URL and quality
                # CRITICAL: Only treat VistaPreviaPliegoCiudadano as stable pliego URLs.
                # ComprasElectronicas.aspx URLs are session-dependent and expire.
                canonical_url = None
                url_quality = "list_only"
                source_urls = {}
                is_stable_pliego = pliego_url and "VistaPreviaPliegoCiudadano" in (pliego_url or "")

                if is_stable_pliego:
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

                # Extract fields from pliego
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
                    nombre_desc = pliego_fields.get("Nombre descriptivo del proceso") or pliego_fields.get("Nombre descriptivo de proceso")
                    if nombre_desc and len(nombre_desc.strip()) > 10:
                        title = nombre_desc.strip()

                content_hash = hashlib.md5(
                    f"{title.lower().strip()}|{servicio_admin or unidad or ''}|{publication_date.strftime('%Y%m%d') if publication_date else 'unknown'}".encode()
                ).hexdigest()

                estado = self._compute_estado(publication_date, opening_date, fecha_prorroga=None)

                if pliego_url and "VistaPreviaPliegoCiudadano" in (pliego_url or ""):
                    self.stats['pliego_urls_found'] += 1

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
                    "source_url": (pliego_url if is_stable_pliego else None) or proxy_open_url or list_url,
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
                    "fecha_scraping": utc_now(),
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

            licitaciones.sort(
                key=lambda l: l.publication_date or datetime.min, reverse=True
            )

            logger.info(
                f"Scraper complete. Total: {len(licitaciones)}, "
                f"Direct pliego URLs: {self.stats['pliego_urls_found']}, "
                f"Cache hits: {self.stats['cache_hits']}, "
                f"Redirects resolved: {self.stats['redirect_resolved']}"
            )

            return licitaciones

        finally:
            await self.cleanup()

    async def extract_links(self, html: str) -> List[str]:
        return []

    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        return None
