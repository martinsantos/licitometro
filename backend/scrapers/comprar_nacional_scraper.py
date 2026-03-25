"""
Scraper for COMPR.AR Nacional (comprar.gob.ar).

Same ASP.NET WebForms platform as COMPR.AR Mendoza.
HTTP-only — no Selenium. Handles 503 gracefully.

Strategies:
1. Primary: ASP.NET postback on comprar.gob.ar/Compras.aspx
2. If 503: log warning, return empty (site may be blocking datacenter IPs)

The scraper will automatically start returning data when the site becomes accessible.
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

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper
from utils.dates import parse_date_guess

logger = logging.getLogger("scraper.comprar_nacional")

# COMPR.AR Nacional base
COMPRAR_BASE = "https://comprar.gob.ar"
COMPRAS_LIST = f"{COMPRAR_BASE}/Compras.aspx"


class ComprarNacionalScraper(BaseScraper):
    """HTTP-only scraper for COMPR.AR Nacional (comprar.gob.ar)."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self.stats = {
            'pages_fetched': 0,
            'rows_found': 0,
            'pliego_urls_found': 0,
            'errors': 0,
        }

    # ------------------------------------------------------------------
    # ASP.NET postback helpers (same as Mendoza v2)
    # ------------------------------------------------------------------

    def _extract_hidden_fields(self, html: str) -> Dict[str, str]:
        soup = BeautifulSoup(html, 'html.parser')
        fields: Dict[str, str] = {}
        for name in ["__VIEWSTATE", "__EVENTVALIDATION", "__VIEWSTATEGENERATOR",
                      "__EVENTTARGET", "__EVENTARGUMENT"]:
            inp = soup.find('input', {'name': name})
            if inp and inp.get('value') is not None:
                fields[name] = inp.get('value')
        for inp in soup.find_all('input', {'type': 'hidden'}):
            name = inp.get('name')
            if name and name not in fields:
                fields[name] = inp.get('value', '')
        return fields

    def _extract_rows_from_list(self, html: str) -> List[Dict[str, Any]]:
        """Extract row data from the Compras list table.

        The grid ID may vary — try multiple known patterns.
        """
        soup = BeautifulSoup(html, 'html.parser')

        # Try known grid IDs (COMPR.AR uses variations)
        grid_ids = [
            re.compile(r'GridListaPliegosAperturaProxima'),
            re.compile(r'GridListaPliegos'),
            re.compile(r'grdListadoProcesos'),
            re.compile(r'GridListaProcesos'),
        ]

        table = None
        for grid_re in grid_ids:
            table = soup.find('table', {'id': grid_re})
            if table:
                break

        if not table:
            # Fallback: find any large data table
            for t in soup.find_all('table'):
                rows = t.find_all('tr')
                if len(rows) > 3:
                    table = t
                    break

        if not table:
            return []

        rows = []
        for row in table.find_all('tr'):
            cols = row.find_all('td')
            if len(cols) < 4:
                continue
            link = cols[0].find('a', href=True)
            target = None
            if link:
                m = re.search(r"__doPostBack\('([^']+)'\s*,\s*'([^']*)'\)", link.get('href', ''))
                if m:
                    target = m.group(1)
            numero = cols[0].get_text(' ', strip=True)
            # Skip pager navigation rows (e.g. "1 2 3 4 5 6 7 8 9 10")
            if re.match(r'^[\d\s.…]+$', numero.strip()):
                continue
            title = cols[1].get_text(' ', strip=True) if len(cols) > 1 else ""
            tipo = cols[2].get_text(' ', strip=True) if len(cols) > 2 else ""
            apertura = cols[3].get_text(' ', strip=True) if len(cols) > 3 else ""
            estado = cols[4].get_text(' ', strip=True) if len(cols) > 4 else ""
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

    def _extract_pager_args(self, html: str) -> Dict[str, List[str]]:
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

    def _extract_pliego_url(self, html: str, base_url: str) -> Optional[str]:
        """Extract PLIEGO URL from detail page HTML."""
        if not html:
            return None

        soup = BeautifulSoup(html, 'html.parser')

        # Strategy 1: Direct <a href> to VistaPreviaPliegoCiudadano
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            if 'VistaPreviaPliegoCiudadano.aspx?qs=' in href:
                return urljoin(base_url, href)

        # Strategy 2: onclick handlers
        for elem in soup.find_all(onclick=True):
            onclick = elem.get('onclick', '')
            m = re.search(r"window\.open\(['\"]([^'\"]+VistaPreviaPliegoCiudadano[^'\"]*)['\"]", onclick)
            if m:
                return urljoin(base_url, m.group(1))

        # Strategy 3: Hidden input fields
        for inp in soup.find_all('input', {'type': 'hidden'}):
            val = inp.get('value', '')
            if 'VistaPreviaPliegoCiudadano.aspx?qs=' in val:
                m = re.search(r'((?:PLIEGO/)?VistaPreviaPliegoCiudadano\.aspx\?qs=[^\s"\'<>&]+)', val)
                if m:
                    return urljoin(base_url, m.group(1))

        # Strategy 4: Script tags
        for script in soup.find_all('script'):
            text = script.string or ''
            m = re.search(r'((?:PLIEGO/)?VistaPreviaPliegoCiudadano\.aspx\?qs=[^\s"\'<>&]+)', text)
            if m:
                return urljoin(base_url, m.group(1))

        # Strategy 5: Raw regex
        patterns = [
            r'((?:PLIEGO/)?VistaPreviaPliegoCiudadano\.aspx\?qs=[^\s"\'<>&]+)',
            r'(ComprasElectronicas\.aspx\?qs=[^\s"\'<>&]+)',
        ]
        for pattern in patterns:
            m = re.search(pattern, html, re.IGNORECASE)
            if m:
                return urljoin(base_url, m.group(1).replace('\\/', '/'))

        return None

    async def _postback(self, url: str, fields: Dict[str, str]) -> Optional[str]:
        try:
            async with self.session.post(str(url), data=fields) as response:
                if response.status == 503:
                    logger.warning(f"comprar.gob.ar returned 503 — site may be blocking datacenter IPs")
                    return None
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

    async def _fetch_and_parse_pliego(self, pliego_url: str, numero: str) -> tuple:
        """Fetch pliego page and extract label-value fields."""
        if not pliego_url:
            return {}, pliego_url

        pliego_html = await self.fetch_page(pliego_url)
        if not pliego_html:
            return {}, pliego_url

        soup = BeautifulSoup(pliego_html, 'html.parser')
        labels = soup.find_all('label')

        # If ComprasElectronicas, try to find VistaPreviaPliego link
        if not labels and "ComprasElectronicas" in pliego_url:
            pliego_link = self._extract_pliego_url(pliego_html, pliego_url)
            if pliego_link and "VistaPreviaPliegoCiudadano" in pliego_link:
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
    # Main run
    # ------------------------------------------------------------------

    async def run(self) -> List[LicitacionCreate]:
        await self.setup()
        try:
            return await self._scrape_comprar()
        finally:
            await self.cleanup()

    async def _quick_fetch(self, url: str) -> Optional[str]:
        """Fetch URL directly via raw session — no retries, fast fail on 503.
        Used for the initial probe so the scraper doesn't hang for minutes."""
        try:
            import aiohttp as _aio
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            timeout = _aio.ClientTimeout(total=30, connect=10, sock_read=20)
            async with self.session.get(url, headers=headers, timeout=timeout) as resp:
                if resp.status == 503:
                    logger.warning(f"comprar.gob.ar returned 503 — site blocking datacenter IPs or under maintenance")
                    return None
                if resp.status != 200:
                    logger.warning(f"comprar.gob.ar returned HTTP {resp.status}")
                    return None
                raw = await resp.read()
                try:
                    return raw.decode(resp.charset or "utf-8")
                except (UnicodeDecodeError, LookupError):
                    return raw.decode("latin-1", errors="replace")
        except Exception as e:
            logger.error(f"comprar.gob.ar connection failed: {e}")
            return None

    async def _scrape_comprar(self) -> List[LicitacionCreate]:
        """Scrape comprar.gob.ar via ASP.NET postback."""
        licitaciones: List[LicitacionCreate] = []
        max_items = self.config.max_items or 200
        max_pages = int(self.config.selectors.get("max_pages", 10))

        # Determine the list URL — either from config or default
        list_url = str(self.config.url)
        if "BuscarAvanzado" in list_url:
            # BuscarAvanzado doesn't work without session — use Compras.aspx
            list_url = COMPRAS_LIST

        logger.info(f"Starting ComprarNacionalScraper with URL: {list_url}")

        # Phase 1: Quick probe — fail fast on 503 instead of retrying for minutes
        list_html = await self._quick_fetch(list_url)
        if not list_html:
            logger.error("comprar.gob.ar inaccessible — skipping this run")
            return []

        # Check for error/maintenance page
        if len(list_html) < 500 or "Error" in list_html[:200]:
            logger.warning(f"comprar.gob.ar returned error page ({len(list_html)} bytes)")
            return []

        rows = self._extract_rows_from_list(list_html)
        if not rows:
            logger.warning("No rows found on comprar.gob.ar list page — page structure may have changed")
            return []

        self.stats['pages_fetched'] += 1
        logger.info(f"Found {len(rows)} rows on first page")

        page_fields = self._extract_hidden_fields(list_html)
        # Tag each row with its page's hidden fields for correct detail postbacks
        all_rows = [(row, dict(page_fields)) for row in rows]

        # Phase 2: Paginate
        pager_args = self._extract_pager_args(list_html)
        grid_targets = list(pager_args.keys())

        if grid_targets and max_pages > 1:
            grid_target = grid_targets[0]
            page_args = pager_args.get(grid_target, [])[:max_pages - 1]

            for page_arg in page_args:
                fields = dict(page_fields)
                fields["__EVENTTARGET"] = grid_target
                fields["__EVENTARGUMENT"] = page_arg

                next_html = await self._postback(list_url, fields)
                if next_html:
                    page_rows = self._extract_rows_from_list(next_html)
                    page_fields = self._extract_hidden_fields(next_html)
                    all_rows.extend((r, dict(page_fields)) for r in page_rows)
                    self.stats['pages_fetched'] += 1
                    await asyncio.sleep(self.config.wait_time)

        logger.info(f"Total rows from {self.stats['pages_fetched']} pages: {len(all_rows)}")
        self.stats['rows_found'] = len(all_rows)

        # Phase 3: Detail postback + pliego URL extraction
        row_entries: List[Dict[str, Any]] = []

        for row, row_hidden_fields in all_rows[:max_items]:
            pliego_url = None

            if row.get("target"):
                detail_fields = dict(row_hidden_fields)
                detail_fields["__EVENTTARGET"] = row["target"]
                detail_fields["__EVENTARGUMENT"] = ""

                detail_html = await self._postback(list_url, detail_fields)
                await asyncio.sleep(self.config.wait_time)

                if detail_html:
                    pliego_url = self._extract_pliego_url(detail_html, COMPRAR_BASE)

            row_entries.append({
                **row,
                "pliego_url": pliego_url,
            })

        # Phase 4: Parallel pliego fetch for field extraction
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
                self.stats['errors'] += 1
                continue
            idx, (fields, url) = result
            pliego_data[idx] = (fields, url)

        # Phase 5: Build LicitacionCreate objects
        seen_ids = set()

        for entry_idx, entry in enumerate(row_entries):
            numero = entry.get("numero")
            title = entry.get("title") or "Proceso de compra"
            tipo = entry.get("tipo") or "Proceso de compra"
            apertura = entry.get("apertura")
            estado_raw = entry.get("estado")
            unidad = entry.get("unidad")
            servicio_admin = entry.get("servicio_admin")

            opening_date_parsed = parse_date_guess(apertura) if apertura else None

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

            pliego_fields, pliego_url = pliego_data.get(entry_idx, ({}, entry.get("pliego_url")))

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
                if not objeto:
                    from utils.object_extractor import extract_objeto
                    objeto = extract_objeto(title, description[:500] if description else "", None)
                currency = pliego_fields.get("Moneda")
                contact = pliego_fields.get("Lugar de recepción de documentación física")
                nombre_desc = pliego_fields.get("Nombre descriptivo del proceso") or pliego_fields.get("Nombre descriptivo de proceso")
                if nombre_desc and len(nombre_desc.strip()) > 10:
                    title = nombre_desc.strip()

            # Determine URL quality
            # CRITICAL: Only VistaPreviaPliegoCiudadano URLs are stable.
            # ComprasElectronicas URLs are session-dependent and expire.
            url_quality = "list_only"
            source_url = list_url
            is_stable_pliego = pliego_url and "VistaPreviaPliegoCiudadano" in (pliego_url or "")
            if is_stable_pliego:
                url_quality = "direct"
                source_url = pliego_url
                self.stats['pliego_urls_found'] += 1

            content_hash = hashlib.md5(
                f"{title.lower().strip()}|{servicio_admin or unidad or ''}|{publication_date.strftime('%Y%m%d') if publication_date else 'unknown'}".encode()
            ).hexdigest()

            estado = self._compute_estado(publication_date, opening_date, fecha_prorroga=None)

            id_licitacion = f"comprar-nac-{numero}" if numero else str(uuid.uuid4())

            lic = LicitacionCreate(**{
                "title": title,
                "organization": servicio_admin or unidad or "Gobierno Nacional",
                "publication_date": publication_date,
                "opening_date": opening_date,
                "expedient_number": expedient_number,
                "licitacion_number": numero,
                "description": description,
                "objeto": objeto,
                "contact": contact,
                "source_url": source_url,
                "url_quality": url_quality,
                "content_hash": content_hash,
                "status": "active",
                "location": "Argentina",
                "attached_files": [],
                "id_licitacion": id_licitacion,
                "jurisdiccion": "Nacional",
                "tipo_procedimiento": tipo,
                "tipo_acceso": "COMPR.AR",
                "fecha_scraping": utc_now(),
                "fuente": self.config.name or "COMPR.AR Nacional",
                "currency": currency,
                "budget": budget,
                "estado": estado,
                "fecha_prorroga": None,
                "metadata": {
                    "comprar_list_url": list_url,
                    "comprar_target": entry.get("target"),
                    "comprar_estado": estado_raw,
                    "comprar_unidad_ejecutora": unidad,
                    "comprar_servicio_admin": servicio_admin,
                    "comprar_pliego_url": pliego_url if is_stable_pliego else None,
                    "comprar_pliego_fields": pliego_fields,
                    "comprar_apertura_raw": apertura,
                },
            })

            if lic.id_licitacion in seen_ids:
                continue
            licitaciones.append(lic)
            seen_ids.add(lic.id_licitacion)

            if len(licitaciones) >= max_items:
                break

        licitaciones.sort(
            key=lambda l: l.publication_date or datetime.min, reverse=True
        )

        logger.info(
            f"ComprarNacional complete. Total: {len(licitaciones)}, "
            f"Pages: {self.stats['pages_fetched']}, Rows: {self.stats['rows_found']}, "
            f"Pliego URLs: {self.stats['pliego_urls_found']}"
        )

        return licitaciones

    # Required abstract methods
    async def extract_licitacion_data(self, html, url):
        return None

    async def extract_links(self, html):
        return []

    async def get_next_page_url(self, html, current_url):
        return None
