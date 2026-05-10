"""
Scraper for COMPR.AR Nacional (comprar.gob.ar).

Same ASP.NET WebForms platform as COMPR.AR Mendoza.
HTTP-only — no Selenium. Uses ResilientHttpClient with circuit breaker,
IPv6 routing, and User-Agent rotation to bypass datacenter IP blocking.

Strategies:
1. Primary: ASP.NET postback on comprar.gob.ar/Compras.aspx
2. If 503: circuit breaker trips, scraper returns empty gracefully
"""

from typing import List, Dict, Any, Optional
import asyncio
import logging
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from datetime import datetime, timedelta
from utils.time import utc_now
import re
import uuid
import sys
import hashlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.comprar_asp_base import ComprarASPBaseScraper
from utils.dates import parse_date_guess

logger = logging.getLogger("scraper.comprar_nacional")

COMPRAR_BASE = "https://comprar.gob.ar"
COMPRAS_LIST = f"{COMPRAR_BASE}/Compras.aspx"


class ComprarNacionalScraper(ComprarASPBaseScraper):
    """HTTP-only scraper for COMPR.AR Nacional (comprar.gob.ar)."""

    # Override in subclasses for different COMPR.AR instances (BAC, etc.)
    compra_base_url: str = COMPRAR_BASE

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self.stats = {
            'pages_fetched': 0,
            'rows_found': 0,
            'pliego_urls_found': 0,
            'errors': 0,
        }

    # ------------------------------------------------------------------
    # Grid detection — nacional has wider grid IDs + fallback
    # ------------------------------------------------------------------

    def _find_grid_table(self, html: str) -> Optional[BeautifulSoup]:
        """Find grid table with nacional-specific patterns + fallback."""
        # Try base class patterns first (includes all known COMPR.AR grid IDs)
        table = super()._find_grid_table(html)
        if table:
            return table

        # Fallback: any table with >3 rows
        soup = BeautifulSoup(html, "html.parser")
        for t in soup.find_all("table"):
            rows = t.find_all("tr")
            if len(rows) > 3:
                return t
        return None

    def _summarize_empty_listing(self, html: str) -> str:
        """Return a compact diagnostic when a COMPR.AR-like listing has no grid."""

        soup = BeautifulSoup(html or "", "html.parser")
        title = soup.find("title")
        title_text = title.get_text(" ", strip=True) if title else "sin title"
        table_count = len(soup.find_all("table"))
        links = [
            a.get("href", "")
            for a in soup.find_all("a", href=True)
            if any(token in a.get("href", "") for token in ("ListarApertura", "BuscarAvanzado", "Compras.aspx"))
        ][:5]
        marker = "default/home"
        text = soup.get_text(" ", strip=True).lower()
        if "pantallaerror" in text or "error" in title_text.lower():
            marker = "error"
        elif "búsqueda avanzada" in text or "busqueda avanzada" in text:
            marker = "search/home"
        return f"title={title_text!r}, marker={marker}, tables={table_count}, candidate_links={links}"

    # ------------------------------------------------------------------
    # Pliego URL extraction
    # ------------------------------------------------------------------

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
        if (self.config.selectors or {}).get("use_selenium"):
            return await asyncio.to_thread(self._run_selenium_home)
        await self.setup()
        try:
            return await self._scrape_comprar()
        finally:
            await self.cleanup()

    def _run_selenium_home(self) -> List[LicitacionCreate]:
        """Scrape COMPR.AR Nacional home grid with a real browser.

        The direct ``Compras.aspx`` endpoint returns PantallaError from the VPS,
        while ``Default.aspx`` renders the public "apertura próxima" grid.
        """
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service
        import os
        import time

        options = Options()
        for arg in [
            "--headless=new",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--window-size=1920,1080",
            "--disable-blink-features=AutomationControlled",
            "--lang=es-AR",
        ]:
            options.add_argument(arg)
        if os.path.isfile("/usr/bin/chromium"):
            options.binary_location = "/usr/bin/chromium"
        service = Service("/usr/bin/chromedriver") if os.path.isfile("/usr/bin/chromedriver") else Service()
        driver = webdriver.Chrome(service=service, options=options)
        try:
            driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
                "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
            })
            driver.get(f"{self.compra_base_url}/Default.aspx")
            time.sleep(5)
            rows = self.extract_rows_from_list(driver.page_source, min_cols=4)
            logger.info("COMPR.AR Selenium home extracted %s rows", len(rows))
            return self._build_items_from_rows(rows, f"{self.compra_base_url}/Default.aspx")
        except Exception as exc:
            logger.error("COMPR.AR Selenium home failed: %s", exc)
            return []
        finally:
            try:
                driver.quit()
            except Exception:
                pass

    def _build_items_from_rows(self, rows: List[Dict[str, Any]], list_url: str) -> List[LicitacionCreate]:
        max_items = self.config.max_items or 100
        licitaciones: List[LicitacionCreate] = []
        seen_ids = set()

        for entry in rows[:max_items]:
            numero = entry.get("numero")
            if not numero:
                continue
            title = entry.get("title") or "Proceso de compra"
            tipo = entry.get("tipo") or "Proceso de compra"
            apertura = entry.get("apertura")
            servicio_admin = entry.get("servicio_admin") or entry.get("unidad")
            opening_date_parsed = parse_date_guess(apertura) if apertura else None
            publication_date = self._resolve_publication_date(
                parsed_date=None,
                title=title,
                description=title,
                opening_date=opening_date_parsed,
                attached_files=[],
            )
            opening_date = self._resolve_opening_date(
                parsed_date=opening_date_parsed,
                title=title,
                description=title,
                publication_date=publication_date,
                attached_files=[],
            )
            estado = self._compute_estado(publication_date, opening_date, fecha_prorroga=None)
            id_licitacion = f"comprar-nac-{numero}"
            if id_licitacion in seen_ids:
                continue
            content_hash = hashlib.md5(
                f"{title.lower().strip()}|{servicio_admin or ''}|{opening_date.strftime('%Y%m%d') if opening_date else 'unknown'}".encode()
            ).hexdigest()
            licitaciones.append(LicitacionCreate(
                title=title,
                organization=servicio_admin or "Gobierno Nacional",
                publication_date=publication_date,
                opening_date=opening_date,
                licitacion_number=numero,
                description=" | ".join([v for v in [
                    numero, title, tipo, apertura, servicio_admin
                ] if v]),
                source_url=list_url,
                url_quality="list_only",
                content_hash=content_hash,
                status="active",
                location="Argentina",
                attached_files=[],
                id_licitacion=id_licitacion,
                jurisdiccion="Nacional",
                tipo_procedimiento=tipo,
                tipo_acceso="COMPR.AR",
                fecha_scraping=utc_now(),
                fuente=self.config.name or "COMPR.AR Nacional",
                estado=estado,
                tags=["LIC_AR"],
                metadata={
                    "comprar_list_url": list_url,
                    "comprar_target": entry.get("target"),
                    "comprar_apertura_raw": apertura,
                    "comprar_extraction": "selenium_home_grid",
                },
            ))
            seen_ids.add(id_licitacion)

        return licitaciones

    async def _scrape_comprar(self) -> List[LicitacionCreate]:
        """Scrape comprar.gob.ar via ASP.NET postback with circuit breaker."""
        licitaciones: List[LicitacionCreate] = []
        max_items = self.config.max_items or 200
        max_pages = int(self.config.selectors.get("max_pages", 10))

        list_url = str(self.config.url)
        if self.compra_base_url == COMPRAR_BASE and "BuscarAvanzado" in list_url:
            list_url = f"{self.compra_base_url}/Compras.aspx"

        logger.info(f"Starting ComprarNacionalScraper with URL: {list_url}")

        # Phase 1: Initial fetch via ResilientHttpClient (circuit breaker + IPv6)
        list_html = await self.http.fetch(list_url)
        if not list_html:
            logger.error("%s inaccessible — circuit breaker may be open, skipping run", self.compra_base_url)
            return []

        if len(list_html) < 500 or "Error" in list_html[:200]:
            logger.warning(f"comprar.gob.ar returned error page ({len(list_html)} bytes)")
            return []

        rows = self.extract_rows_from_list(list_html, min_cols=4)
        if not rows:
            logger.warning(
                "No rows found on %s list page — %s",
                self.compra_base_url,
                self._summarize_empty_listing(list_html),
            )
            return []

        self.stats['pages_fetched'] += 1
        logger.info(f"Found {len(rows)} rows on first page")

        page_fields = self.extract_hidden_fields(list_html)
        all_rows = [(row, dict(page_fields)) for row in rows]

        # Phase 2: Paginate via ASP.NET postbacks
        pager_args = self.extract_pager_args(list_html)
        grid_targets = list(pager_args.keys())

        if grid_targets and max_pages > 1:
            grid_target = grid_targets[0]
            page_args = pager_args.get(grid_target, [])[:max_pages - 1]

            for page_arg in page_args:
                fields = dict(page_fields)
                fields["__EVENTTARGET"] = grid_target
                fields["__EVENTARGUMENT"] = page_arg

                next_html = await self.postback(list_url, fields)
                if next_html:
                    page_rows = self.extract_rows_from_list(next_html, min_cols=4)
                    page_fields = self.extract_hidden_fields(next_html)
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

                detail_html = await self.postback(list_url, detail_fields)
                await asyncio.sleep(self.config.wait_time)

                if detail_html:
                    pliego_url = self._extract_pliego_url(detail_html, self.compra_base_url)

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

            description = title
            expedient_number = None
            contact = None
            currency = None
            budget = None
            objeto = None

            if pliego_fields:
                expedient_number = pliego_fields.get("Numero de expediente") or pliego_fields.get("Numero de Expediente")
                description = pliego_fields.get("Objeto de la contratacion") or pliego_fields.get("Objeto") or description
                objeto = pliego_fields.get("Objeto de la contratacion") or pliego_fields.get("Objeto")
                if not objeto:
                    from utils.object_extractor import extract_objeto
                    objeto = extract_objeto(title, description[:1000] if description else "", None)
                currency = pliego_fields.get("Moneda")
                contact = pliego_fields.get("Lugar de recepcion de documentacion fisica")
                nombre_desc = pliego_fields.get("Nombre descriptivo del proceso") or pliego_fields.get("Nombre descriptivo de proceso")
                if nombre_desc and len(nombre_desc.strip()) > 10:
                    title = nombre_desc.strip()

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
