"""
EMESA (Empresa Mendocina de Energía) Scraper - Selenium-based

URL: https://emesa.com.ar/licitaciones/
Problem: OpenResty WAF with JS challenge blocks aiohttp/requests.
         Challenge checks: navigator.webdriver, headless indicators, plugin arrays,
         user-agent patterns ("headless|bytespider"), then auto-submits a form.

Solution: Selenium with anti-detection flags, wait for WAF challenge to resolve,
          then parse the actual page content.
"""

from typing import List, Dict, Any, Optional
import asyncio
import logging
from bs4 import BeautifulSoup
from datetime import datetime
import re
import hashlib
import sys
import time
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper
from utils.dates import parse_date_guess

logger = logging.getLogger("scraper.emesa")

DEFAULT_URL = "https://emesa.com.ar/licitaciones/"

CHROME_OPTIONS = [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1920,1080",
    "--disable-blink-features=AutomationControlled",
    "--lang=es-AR",
]
CHROMIUM_BINARY = "/usr/bin/chromium"
CHROMEDRIVER_PATH = "/usr/bin/chromedriver"


class EmesaScraper(BaseScraper):
    """
    Scraper for EMESA licitaciones using Selenium to bypass WAF challenge.
    """

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self.base_url = str(config.url) if config.url else DEFAULT_URL

    def _create_driver(self):
        """Create a Selenium WebDriver with stealth settings."""
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service

        options = Options()
        for opt in CHROME_OPTIONS:
            options.add_argument(opt)

        if os.path.isfile(CHROMIUM_BINARY):
            options.binary_location = CHROMIUM_BINARY

        # Anti-detection
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)

        service_kwargs = {}
        if os.path.isfile(CHROMEDRIVER_PATH):
            service_kwargs["executable_path"] = CHROMEDRIVER_PATH

        service = Service(**service_kwargs)
        driver = webdriver.Chrome(service=service, options=options)

        # Remove webdriver flag and add realistic browser properties
        driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
            "source": """
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5]
                });
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['es-AR', 'es', 'en-US', 'en']
                });
                window.chrome = { runtime: {} };
            """
        })

        driver.set_page_load_timeout(30)
        return driver

    def _wait_for_content(self, driver, max_wait: int = 15) -> bool:
        """Wait for WAF challenge to resolve and actual content to appear."""
        for i in range(max_wait):
            page_src = driver.page_source.lower()
            # WAF challenge indicators
            if "please wait while your request is being verified" in page_src:
                time.sleep(1)
                continue
            # Check for actual content
            if "licitaci" in page_src or "<article" in page_src or "<table" in page_src:
                return True
            time.sleep(1)
        return False

    def _scrape_sync(self) -> List[Dict[str, Any]]:
        """Synchronous Selenium scraping in thread executor."""
        driver = self._create_driver()
        items = []
        try:
            logger.info(f"Loading EMESA page: {self.base_url}")
            driver.get(self.base_url)

            if not self._wait_for_content(driver):
                logger.warning("WAF challenge did not resolve after waiting")
                # Try a page refresh
                driver.refresh()
                time.sleep(5)
                if not self._wait_for_content(driver):
                    logger.error("EMESA: WAF challenge still blocking after retry")
                    return []

            logger.info("WAF challenge resolved, parsing content")
            soup = BeautifulSoup(driver.page_source, "html.parser")

            # Try multiple extraction strategies
            items = self._extract_from_articles(soup)
            if not items:
                items = self._extract_from_table(soup)
            if not items:
                items = self._extract_from_divs(soup)

            if not items:
                # Log page structure for debugging
                body = soup.find("body")
                if body:
                    logger.warning(f"EMESA: No items found. Body text preview: {body.get_text(strip=True)[:500]}")

            logger.info(f"EMESA: Extracted {len(items)} items")

        except Exception as e:
            logger.error(f"EMESA Selenium error: {e}")
        finally:
            try:
                driver.quit()
            except Exception:
                pass

        return items

    def _extract_from_articles(self, soup: BeautifulSoup) -> List[Dict]:
        """Extract from WordPress article elements."""
        items = []
        for article in soup.find_all("article"):
            title_el = article.find(["h1", "h2", "h3", "h4"])
            title = title_el.get_text(strip=True) if title_el else ""
            if not title:
                continue

            link_el = article.find("a", href=True)
            link = link_el["href"] if link_el else ""

            date_el = article.find("time")
            date_str = date_el.get("datetime", date_el.get_text(strip=True)) if date_el else ""

            desc_el = article.find(["p", ".entry-content", ".excerpt"])
            desc = desc_el.get_text(strip=True) if desc_el else ""

            items.append({
                "titulo": title,
                "url": link,
                "fecha": date_str,
                "descripcion": desc,
            })
        return items

    def _extract_from_table(self, soup: BeautifulSoup) -> List[Dict]:
        """Extract from HTML table rows."""
        items = []
        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            if len(rows) < 2:
                continue

            # Try to detect header row
            headers = []
            first_row = rows[0]
            for cell in first_row.find_all(["th", "td"]):
                headers.append(cell.get_text(strip=True).lower())

            for row in rows[1:]:
                cells = row.find_all(["td", "th"])
                if len(cells) < 2:
                    continue

                texts = [c.get_text(strip=True) for c in cells]
                link_el = row.find("a", href=True)
                link = link_el["href"] if link_el else ""

                # Guess which column is title (longest text)
                title_idx = max(range(len(texts)), key=lambda i: len(texts[i]))
                title = texts[title_idx]
                if not title or len(title) < 5:
                    continue

                # Try to find date
                fecha = ""
                for t in texts:
                    if re.search(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", t):
                        fecha = t
                        break

                items.append({
                    "titulo": title,
                    "url": link,
                    "fecha": fecha,
                    "descripcion": " | ".join(texts),
                })
        return items

    def _extract_from_divs(self, soup: BeautifulSoup) -> List[Dict]:
        """Extract from div-based layouts (cards, list items, etc)."""
        items = []
        # Common CMS card/list patterns
        selectors = [
            ".entry-content li",
            ".post-content li",
            ".licitacion",
            ".card",
            ".list-group-item",
            "section li",
        ]
        for sel in selectors:
            elements = soup.select(sel)
            for el in elements:
                title_el = el.find(["h1", "h2", "h3", "h4", "a", "strong"])
                title = title_el.get_text(strip=True) if title_el else el.get_text(strip=True)
                if not title or len(title) < 5:
                    continue

                link_el = el.find("a", href=True)
                link = link_el["href"] if link_el else ""

                items.append({
                    "titulo": title[:300],
                    "url": link,
                    "fecha": "",
                    "descripcion": el.get_text(strip=True)[:500],
                })
            if items:
                break  # Use the first selector that finds items

        return items

    def _item_to_licitacion(self, item: Dict) -> Optional[LicitacionCreate]:
        """Convert an extracted item to LicitacionCreate."""
        title = item.get("titulo", "").strip()
        if not title:
            return None

        # Generate ID
        slug = re.sub(r"\W+", "-", title.lower())[:80]
        id_lic = f"emesa:{slug}"

        # Parse date from item
        fecha_parsed = None
        if item.get("fecha"):
            fecha_parsed = parse_date_guess(item["fecha"])

        description = item.get("descripcion", "")

        # VIGENCIA MODEL: Resolve dates with multi-source fallback
        publication_date = self._resolve_publication_date(
            parsed_date=fecha_parsed,
            title=title,
            description=description,
            opening_date=None,
            attached_files=[]
        )

        opening_date = self._resolve_opening_date(
            parsed_date=None,
            title=title,
            description=description,
            publication_date=publication_date,
            attached_files=[]
        )

        # Compute estado
        estado = self._compute_estado(publication_date, opening_date, fecha_prorroga=None)

        # Content hash (handle None publication_date)
        content = f"{title}|{description}|{publication_date.strftime('%Y%m%d') if publication_date else 'unknown'}"
        content_hash = hashlib.md5(content.encode()).hexdigest()

        url = item.get("url", "")
        if url and not url.startswith("http"):
            url = f"https://emesa.com.ar{url}" if url.startswith("/") else ""

        return LicitacionCreate(
            id_licitacion=id_lic,
            title=title,
            description=description,
            organization="EMESA - Empresa Mendocina de Energía",
            publication_date=publication_date,
            opening_date=opening_date,
            fuente="EMESA",
            source_url=url or self.base_url,
            status="active",
            tipo_procedimiento="Licitación",
            jurisdiccion="Mendoza",
            content_hash=content_hash,
            estado=estado,
            fecha_prorroga=None,
        )

    # -- BaseScraper abstract methods (stubs for Selenium-based scraper) --

    async def extract_licitacion_data(self, html: str, url: str) -> Optional[dict]:
        return None

    async def extract_links(self, html: str) -> List[str]:
        return []

    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        return None

    # -- Main entry point --

    async def run(self) -> List[LicitacionCreate]:
        """Run the EMESA scraper with Selenium in a thread executor."""
        await self.setup()
        try:
            logger.info(f"Starting EMESA scraper - URL: {self.base_url}")

            loop = asyncio.get_event_loop()
            raw_items = await loop.run_in_executor(None, self._scrape_sync)

            logger.info(f"Selenium extraction complete: {len(raw_items)} items")

            licitaciones: List[LicitacionCreate] = []
            seen_ids = set()

            for item in raw_items:
                lic = self._item_to_licitacion(item)
                if lic and lic.id_licitacion not in seen_ids:
                    licitaciones.append(lic)
                    seen_ids.add(lic.id_licitacion)

                if self.config.max_items and len(licitaciones) >= self.config.max_items:
                    break

            logger.info(f"EMESA scraper complete: {len(licitaciones)} licitaciones")
            return licitaciones
        finally:
            await self.cleanup()
