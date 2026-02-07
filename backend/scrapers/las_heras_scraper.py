"""
Las Heras Municipality Scraper - Buscador de Licitaciones (Oracle APEX)

URL: https://web6.lasheras.gob.ar/apex/f?p=105:22
Platform: Oracle APEX application

This scraper uses Selenium with headless Chromium to navigate the Oracle APEX
application which renders content dynamically via JavaScript. APEX apps use
interactive reports (IR) or classic reports that require a browser environment
to fully render.

Key APEX patterns handled:
- IR (Interactive Report) tables with class t-Report or t-IRR-region
- APEX session state management (p_instance, p_flow_id, etc.)
- Pagination via "Next >" links or page selector
- Dynamic region refresh after search/filter actions
"""

from typing import List, Dict, Any, Optional
import asyncio
import logging
from bs4 import BeautifulSoup
from datetime import datetime
import re
import uuid
import hashlib
import sys
import time
from pathlib import Path

# Add parent directory to path so we can import modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper
from utils.dates import parse_date_guess

logger = logging.getLogger("scraper.las_heras")

# Default APEX page URL
DEFAULT_URL = "https://web6.lasheras.gob.ar/apex/f?p=105:22"

# Selenium Chrome configuration
CHROME_OPTIONS = [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1920,1080",
    "--disable-blink-features=AutomationControlled",
]
CHROMIUM_BINARY = "/usr/bin/chromium"
CHROMEDRIVER_PATH = "/usr/bin/chromedriver"


class LasHerasScraper(BaseScraper):
    """
    Scraper for Las Heras municipality bidding portal.

    The site is an Oracle APEX application (app 105, page 22) that displays
    a searchable list of licitaciones. We use Selenium to:
    1. Load the APEX page and wait for the report to render
    2. Optionally interact with search/filter controls
    3. Parse the results table rows
    4. Handle pagination to collect all pages
    5. Build LicitacionCreate objects from the extracted data
    """

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self.base_url = str(config.url) if config.url else DEFAULT_URL
        self.stats = {
            "pages_processed": 0,
            "rows_extracted": 0,
            "licitaciones_created": 0,
            "errors": 0,
        }

    # ------------------------------------------------------------------
    # Selenium helpers (synchronous - run in thread executor)
    # ------------------------------------------------------------------

    def _create_driver(self):
        """Create a Selenium WebDriver with headless Chromium."""
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service

        options = Options()
        for opt in CHROME_OPTIONS:
            options.add_argument(opt)

        # Use configured binary paths if they exist, otherwise let
        # Selenium find them on PATH (works in Docker and local dev).
        import os
        if os.path.isfile(CHROMIUM_BINARY):
            options.binary_location = CHROMIUM_BINARY

        # Avoid automation detection
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)

        service_kwargs = {}
        if os.path.isfile(CHROMEDRIVER_PATH):
            service_kwargs["executable_path"] = CHROMEDRIVER_PATH

        service = Service(**service_kwargs)
        driver = webdriver.Chrome(service=service, options=options)

        # Remove webdriver flag
        driver.execute_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        return driver

    def _wait_for_report(self, driver, timeout: int = 30):
        """Wait for the APEX report table to appear in the DOM."""
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        # Oracle APEX uses several class patterns for reports.
        # We try multiple selectors in order of specificity.
        selectors = [
            "table.t-Report-report",          # Classic Report
            "div.t-IRR-region table",          # Interactive Report
            "table.a-IRR-table",               # IR alternate class
            "div.a-IRR table",                 # Another IR variant
            "table[summary]",                  # Older APEX classic report
            "div.t-Region-body table",         # Generic region table
            "table.uReport",                   # Universal Theme report
            "table",                           # Last resort fallback
        ]

        for selector in selectors:
            try:
                WebDriverWait(driver, timeout).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                )
                logger.info(f"Report table found with selector: {selector}")
                return selector
            except Exception:
                continue

        logger.warning("Could not find report table with any known selector")
        return None

    def _extract_rows_from_page(self, page_source: str) -> List[Dict[str, Any]]:
        """
        Parse the current page source and extract table rows.

        Oracle APEX reports typically render as:
        <table class="t-Report-report">
          <thead><tr><th>...</th></tr></thead>
          <tbody><tr><td>...</td></tr></tbody>
        </table>

        Headers are discovered dynamically so the scraper adapts to
        whatever columns the APEX report exposes.
        """
        soup = BeautifulSoup(page_source, "html.parser")
        rows: List[Dict[str, Any]] = []

        # Find the report table
        table = None
        table_candidates = [
            soup.find("table", class_=re.compile(r"t-Report-report|a-IRR-table", re.I)),
            soup.find("div", class_=re.compile(r"t-IRR-region|a-IRR", re.I)),
            soup.find("table", class_=re.compile(r"uReport|t-Report", re.I)),
        ]

        for candidate in table_candidates:
            if candidate:
                # If we found a div container, get the table inside it
                if candidate.name == "div":
                    table = candidate.find("table")
                else:
                    table = candidate
                if table:
                    break

        if not table:
            # Fallback: find the largest table on the page
            all_tables = soup.find_all("table")
            best = None
            best_rows = 0
            for t in all_tables:
                tr_count = len(t.find_all("tr"))
                if tr_count > best_rows:
                    best_rows = tr_count
                    best = t
            if best and best_rows > 1:
                table = best

        if not table:
            logger.warning("No table found in page source")
            return rows

        # Extract headers
        headers: List[str] = []
        thead = table.find("thead")
        if thead:
            header_cells = thead.find_all(["th", "td"])
            headers = [cell.get_text(" ", strip=True) for cell in header_cells]
        else:
            # Try first row as header
            first_row = table.find("tr")
            if first_row:
                ths = first_row.find_all("th")
                if ths:
                    headers = [th.get_text(" ", strip=True) for th in ths]

        # Normalize header names for field mapping
        header_lower = [h.lower().strip() for h in headers]
        logger.info(f"Table headers detected: {headers}")

        # Build column index map
        col_map = self._build_column_map(header_lower)

        # Parse data rows
        tbody = table.find("tbody") or table
        data_rows = tbody.find_all("tr")

        # Skip header row if no thead was found
        start_idx = 0
        if not thead and data_rows:
            first_cells = data_rows[0].find_all("th")
            if first_cells:
                start_idx = 1

        for tr in data_rows[start_idx:]:
            cells = tr.find_all("td")
            if not cells or len(cells) < 2:
                continue

            row_data: Dict[str, Any] = {}

            # Extract all cell values by index
            cell_texts = [c.get_text(" ", strip=True) for c in cells]
            row_data["_raw_cells"] = cell_texts

            # Map known columns
            for field, idx in col_map.items():
                if idx < len(cell_texts):
                    row_data[field] = cell_texts[idx]

            # If no mapping worked, try positional heuristic
            if not row_data.get("numero") and not row_data.get("titulo"):
                if len(cell_texts) >= 2:
                    row_data["numero"] = cell_texts[0]
                    # Title is usually the longest cell
                    longest_idx = max(range(len(cell_texts)), key=lambda i: len(cell_texts[i]))
                    row_data["titulo"] = cell_texts[longest_idx]

            # Extract any links from the row (for detail pages)
            for cell in cells:
                link = cell.find("a", href=True)
                if link:
                    href = link.get("href", "")
                    if href and not href.startswith("javascript:void"):
                        # Could be relative APEX URL like f?p=105:23:...
                        if href.startswith("f?p=") or href.startswith("/apex/"):
                            base = self.base_url.split("/apex/")[0] if "/apex/" in self.base_url else self.base_url.rsplit("/", 1)[0]
                            if href.startswith("f?p="):
                                href = f"{base}/apex/{href}"
                            elif href.startswith("/"):
                                href = f"{base}{href}"
                        row_data["detail_url"] = href
                        break

            if row_data.get("numero") or row_data.get("titulo"):
                rows.append(row_data)

        logger.info(f"Extracted {len(rows)} data rows from page")
        return rows

    def _build_column_map(self, header_lower: List[str]) -> Dict[str, int]:
        """
        Map normalized header names to our internal field names.
        Supports multiple Spanish-language variations.
        """
        field_patterns = {
            "numero": [
                "nro", "n°", "numero", "número", "nro.", "nro licitación",
                "nro licitacion", "id", "expediente", "nº",
            ],
            "titulo": [
                "objeto", "descripción", "descripcion", "titulo", "título",
                "detalle", "concepto", "asunto", "rubro",
            ],
            "tipo": [
                "tipo", "procedimiento", "modalidad", "clase",
                "tipo contratación", "tipo contratacion",
            ],
            "fecha_publicacion": [
                "publicación", "publicacion", "fecha publicación",
                "fecha publicacion", "fecha pub", "fecha",
            ],
            "fecha_apertura": [
                "apertura", "fecha apertura", "fec. apertura",
                "fecha de apertura", "vencimiento",
            ],
            "estado": [
                "estado", "situación", "situacion", "etapa",
            ],
            "organismo": [
                "organismo", "entidad", "repartición", "reparticion",
                "dependencia", "area", "área", "secretaría", "secretaria",
            ],
            "monto": [
                "monto", "presupuesto", "importe", "valor",
                "presupuesto oficial",
            ],
        }

        col_map: Dict[str, int] = {}
        for idx, header in enumerate(header_lower):
            if not header:
                continue
            for field, patterns in field_patterns.items():
                if field in col_map:
                    continue  # already mapped
                if any(p in header for p in patterns):
                    col_map[field] = idx
                    break

        return col_map

    def _has_next_page(self, driver) -> bool:
        """Check if there is a next page in APEX pagination."""
        from selenium.webdriver.common.by import By

        # APEX pagination patterns
        next_selectors = [
            "a.t-Report-paginationLink--next",
            "a.a-IRR-pagination-next",
            "a[title='Next']",
            "a[title='Siguiente']",
            "a.pagination-next",
            "li.t-Report-pagination--next a",
            "span.t-Report-paginationText a:last-child",
        ]

        for selector in next_selectors:
            try:
                elems = driver.find_elements(By.CSS_SELECTOR, selector)
                for elem in elems:
                    if elem.is_displayed() and elem.is_enabled():
                        return True
            except Exception:
                continue

        # Also check for ">" or ">>" text links in pagination area
        try:
            pagination_area = driver.find_elements(
                By.CSS_SELECTOR,
                ".t-Report-pagination, .a-IRR-pagination, .t-Report-paginationText"
            )
            for area in pagination_area:
                links = area.find_elements(By.TAG_NAME, "a")
                for link in links:
                    text = link.text.strip()
                    if text in (">", ">>", "Siguiente", "Next"):
                        return True
        except Exception:
            pass

        return False

    def _click_next_page(self, driver) -> bool:
        """Click the next page button/link in APEX pagination."""
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        next_selectors = [
            "a.t-Report-paginationLink--next",
            "a.a-IRR-pagination-next",
            "a[title='Next']",
            "a[title='Siguiente']",
            "a.pagination-next",
            "li.t-Report-pagination--next a",
        ]

        for selector in next_selectors:
            try:
                elems = driver.find_elements(By.CSS_SELECTOR, selector)
                for elem in elems:
                    if elem.is_displayed() and elem.is_enabled():
                        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", elem)
                        time.sleep(0.3)
                        driver.execute_script("arguments[0].click();", elem)
                        time.sleep(2)  # Wait for APEX to refresh the report
                        return True
            except Exception:
                continue

        # Fallback: look for text-based next links
        try:
            pagination_areas = driver.find_elements(
                By.CSS_SELECTOR,
                ".t-Report-pagination, .a-IRR-pagination, .t-Report-paginationText"
            )
            for area in pagination_areas:
                links = area.find_elements(By.TAG_NAME, "a")
                for link in links:
                    text = link.text.strip()
                    if text in (">", ">>", "Siguiente", "Next"):
                        driver.execute_script("arguments[0].click();", link)
                        time.sleep(2)
                        return True
        except Exception:
            pass

        return False

    def _scrape_all_pages_sync(self) -> List[Dict[str, Any]]:
        """
        Synchronous Selenium workflow: load page, parse table, paginate.
        This runs in a thread executor to avoid blocking the event loop.
        """
        all_rows: List[Dict[str, Any]] = []
        driver = None

        try:
            driver = self._create_driver()
            logger.info(f"Loading APEX page: {self.base_url}")
            driver.get(self.base_url)

            # Wait for report
            table_selector = self._wait_for_report(driver, timeout=30)
            if not table_selector:
                logger.error("Report table did not appear within timeout")
                return all_rows

            # Allow extra time for APEX IR to fully initialize
            time.sleep(2)

            # Determine max pages from config
            selectors = self.config.selectors or {}
            max_pages = int(selectors.get("max_pages", 10))

            page_num = 1
            while page_num <= max_pages:
                logger.info(f"Scraping page {page_num}")
                self.stats["pages_processed"] += 1

                # Parse current page
                page_source = driver.page_source
                rows = self._extract_rows_from_page(page_source)
                all_rows.extend(rows)
                self.stats["rows_extracted"] += len(rows)

                logger.info(f"Page {page_num}: extracted {len(rows)} rows (total: {len(all_rows)})")

                # Check max items
                if self.config.max_items and len(all_rows) >= self.config.max_items:
                    logger.info(f"Reached max_items limit ({self.config.max_items})")
                    break

                # Try to go to next page
                if not self._has_next_page(driver):
                    logger.info("No more pages available")
                    break

                if not self._click_next_page(driver):
                    logger.info("Could not click next page")
                    break

                # Wait for table to refresh after pagination
                self._wait_for_report(driver, timeout=15)
                page_num += 1

        except Exception as e:
            logger.error(f"Selenium scraping error: {e}", exc_info=True)
            self.stats["errors"] += 1
        finally:
            if driver:
                try:
                    driver.quit()
                except Exception:
                    pass

        return all_rows

    # ------------------------------------------------------------------
    # Data conversion
    # ------------------------------------------------------------------

    def _row_to_licitacion(self, row: Dict[str, Any]) -> Optional[LicitacionCreate]:
        """Convert an extracted row dict into a LicitacionCreate object."""
        try:
            numero = row.get("numero", "").strip()
            titulo = row.get("titulo", "").strip()
            tipo_raw = row.get("tipo", "").strip()
            fecha_pub_raw = row.get("fecha_publicacion", "").strip()
            fecha_ap_raw = row.get("fecha_apertura", "").strip()
            estado_raw = row.get("estado", "").strip()
            organismo_raw = row.get("organismo", "").strip()
            monto_raw = row.get("monto", "").strip()
            detail_url = row.get("detail_url")

            # We need at least a number or title to create a record
            if not numero and not titulo:
                return None

            # Title defaults
            title = titulo or f"Licitación {numero}"
            organization = organismo_raw or "Municipalidad de Las Heras"

            # Parse dates
            publication_date = parse_date_guess(fecha_pub_raw) if fecha_pub_raw else None
            opening_date = parse_date_guess(fecha_ap_raw) if fecha_ap_raw else None

            if not publication_date:
                publication_date = opening_date or datetime.utcnow()

            # Type
            tipo_procedimiento = tipo_raw or "Licitación"

            # Status mapping
            status = "active"
            if estado_raw:
                estado_lower = estado_raw.lower()
                if any(w in estado_lower for w in ["adjudicad", "resuelt"]):
                    status = "awarded"
                elif any(w in estado_lower for w in ["cerrad", "finaliz", "vencid"]):
                    status = "closed"
                elif any(w in estado_lower for w in ["cancelad", "desiert", "anulad"]):
                    status = "cancelled"
                elif any(w in estado_lower for w in ["en curso", "vigente", "abiert"]):
                    status = "active"

            # Budget
            budget = None
            currency = "ARS"
            if monto_raw:
                clean = monto_raw.replace("$", "").replace(".", "").replace(",", ".").strip()
                m = re.search(r"[\d.]+", clean)
                if m:
                    try:
                        budget = float(m.group())
                    except ValueError:
                        pass
                if "USD" in monto_raw.upper() or "U$S" in monto_raw.upper():
                    currency = "USD"

            # Source URL
            source_url = detail_url or self.base_url

            # Unique ID: prefer the licitacion number, fall back to hash
            id_licitacion = numero if numero else hashlib.md5(
                f"lasheras|{title}|{publication_date.isoformat()}".encode()
            ).hexdigest()[:16]

            # Content hash for deduplication
            content_hash = hashlib.md5(
                f"{title.lower().strip()}|{organization}|{publication_date.strftime('%Y%m%d')}".encode()
            ).hexdigest()

            # Metadata with raw row for debugging
            metadata = {
                "las_heras_raw_cells": row.get("_raw_cells", []),
                "las_heras_estado": estado_raw,
                "las_heras_tipo": tipo_raw,
                "las_heras_detail_url": detail_url,
            }

            return LicitacionCreate(
                title=title,
                organization=organization,
                publication_date=publication_date,
                opening_date=opening_date,
                description=title,
                source_url=source_url,
                canonical_url=detail_url or self.base_url,
                source_urls={"las_heras": source_url},
                url_quality="direct" if detail_url else "partial",
                content_hash=content_hash,
                status=status,
                location="Las Heras, Mendoza",
                id_licitacion=f"LH-{id_licitacion}",
                jurisdiccion="Mendoza",
                tipo_procedimiento=tipo_procedimiento,
                tipo_acceso="Portal Municipal",
                fecha_scraping=datetime.utcnow(),
                fuente="Municipalidad de Las Heras",
                currency=currency if budget else None,
                budget=budget,
                metadata=metadata,
                licitacion_number=numero or None,
                provincia="Mendoza",
                municipios_cubiertos="Las Heras",
            )

        except Exception as e:
            logger.error(f"Error converting row to licitacion: {e}", exc_info=True)
            self.stats["errors"] += 1
            return None

    # ------------------------------------------------------------------
    # Main entry point (async)
    # ------------------------------------------------------------------

    async def run(self) -> List[LicitacionCreate]:
        """
        Run the Las Heras scraper.

        Uses asyncio.get_event_loop().run_in_executor to run
        the synchronous Selenium code in a thread pool.
        """
        await self.setup()
        try:
            logger.info(f"Starting Las Heras scraper - URL: {self.base_url}")

            # Run Selenium in a thread executor to avoid blocking
            loop = asyncio.get_event_loop()
            raw_rows = await loop.run_in_executor(None, self._scrape_all_pages_sync)

            logger.info(f"Selenium extraction complete: {len(raw_rows)} rows")

            # Convert rows to LicitacionCreate objects
            licitaciones: List[LicitacionCreate] = []
            seen_ids = set()

            for row in raw_rows:
                lic = self._row_to_licitacion(row)
                if lic and lic.id_licitacion not in seen_ids:
                    licitaciones.append(lic)
                    seen_ids.add(lic.id_licitacion)
                    self.stats["licitaciones_created"] += 1

                if self.config.max_items and len(licitaciones) >= self.config.max_items:
                    break

            # Sort by publication date (newest first)
            licitaciones.sort(key=lambda l: l.publication_date, reverse=True)

            logger.info(
                f"Las Heras scraper complete. "
                f"Pages: {self.stats['pages_processed']}, "
                f"Rows: {self.stats['rows_extracted']}, "
                f"Licitaciones: {self.stats['licitaciones_created']}, "
                f"Errors: {self.stats['errors']}"
            )

            return licitaciones

        except Exception as e:
            logger.error(f"Las Heras scraper failed: {e}", exc_info=True)
            return []
        finally:
            await self.cleanup()

    # ------------------------------------------------------------------
    # BaseScraper abstract method stubs (not used - run() is overridden)
    # ------------------------------------------------------------------

    async def extract_licitacion_data(self, html: str, url: str) -> Optional[LicitacionCreate]:
        """Not used - scraping is done via Selenium in run()."""
        return None

    async def extract_links(self, html: str) -> List[str]:
        """Not used - scraping is done via Selenium in run()."""
        return []

    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        """Not used - pagination is handled in Selenium."""
        return None
