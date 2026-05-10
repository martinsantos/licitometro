"""
Scraper for BAC — Buenos Aires Compras (bac.buyarg.com).

Same COMPR.AR ASP.NET WebForms engine as Nacional and Mendoza.
Shares all postback, pagination, and pliego-extraction logic from
ComprarNacionalScraper via ComprarASPBaseScraper.
"""

import logging
import os
import re
import uuid
from datetime import datetime
from typing import List
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.comprar_nacional_scraper import ComprarNacionalScraper
from utils.dates import parse_date_guess
from utils.time import utc_now

logger = logging.getLogger("scraper.bac_buenos_aires")

BAC_BASE = "https://www.buenosairescompras.gob.ar"
DEFAULT_FUENTE = "bac_buenos_aires"
CHROMIUM_BINARY = "/usr/bin/chromium"
CHROMEDRIVER_PATH = "/usr/bin/chromedriver"


class BACScraper(ComprarNacionalScraper):
    """Scraper for BAC — Buenos Aires Compras (bac.buyarg.com).

    Inherits all COMPR.AR ASP.NET logic from ComprarNacionalScraper.
    Overrides base URL, fuente, and jurisdiccion.
    """

    compra_base_url: str = BAC_BASE

    def __init__(self, config: ScraperConfig):
        super().__init__(config)

    async def run(self) -> List[LicitacionCreate]:
        selectors = self.config.selectors or {}
        if selectors.get("use_selenium", True):
            import asyncio

            return await asyncio.to_thread(self._run_selenium)

        await self.setup()
        try:
            licitaciones = await self._scrape_comprar()
        finally:
            await self.cleanup()

        for lic in licitaciones:
            lic.fuente = DEFAULT_FUENTE
            lic.jurisdiccion = "Buenos Aires"
            existing_tags = list(lic.tags or [])
            if "LIC_AR" not in existing_tags:
                existing_tags.append("LIC_AR")
            lic.tags = existing_tags
            if lic.id_licitacion and lic.id_licitacion.startswith("comprar-nac-"):
                lic.id_licitacion = lic.id_licitacion.replace("comprar-nac-", "bac-bsas-", 1)

        return licitaciones

    def _create_driver(self):
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service

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
        if os.path.isfile(CHROMIUM_BINARY):
            options.binary_location = CHROMIUM_BINARY
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)
        service = Service(CHROMEDRIVER_PATH) if os.path.isfile(CHROMEDRIVER_PATH) else Service()
        driver = webdriver.Chrome(service=service, options=options)
        driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
            "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        })
        driver.set_page_load_timeout(45)
        return driver

    def _run_selenium(self) -> List[LicitacionCreate]:
        from selenium.webdriver.common.by import By

        selectors = self.config.selectors or {}
        terms = selectors.get("search_terms") or ["servicio", "obra", "compra", "mantenimiento"]
        max_items = self.config.max_items or 25
        driver = self._create_driver()
        found: List[LicitacionCreate] = []
        seen = set()
        diagnostics = []
        try:
            driver.get(f"{BAC_BASE}/Default.aspx")
            self._sleep(2)
            self._open_advanced_search(driver)
            for term in terms:
                if len(found) >= max_items:
                    break
                html = self._search_term(driver, term)
                rows = self._extract_result_rows(html)
                diagnostics.append(f"{term}: {len(rows)} rows")
                for row in rows:
                    try:
                        lic = self._row_to_licitacion(row, term)
                    except Exception as exc:
                        logger.warning("BAC row skipped: %s row=%s", exc, row)
                        continue
                    if not lic or lic.id_licitacion in seen:
                        continue
                    found.append(lic)
                    seen.add(lic.id_licitacion)
                    if len(found) >= max_items:
                        break
            if not found:
                logger.warning("BAC Selenium produced no items. Diagnostics: %s", diagnostics)
            return found
        except Exception as exc:
            logger.error("BAC Selenium scraper failed: %s", exc)
            return found
        finally:
            try:
                driver.quit()
            except Exception:
                pass

    @staticmethod
    def _sleep(seconds: float) -> None:
        import time

        time.sleep(seconds)

    def _open_advanced_search(self, driver) -> None:
        from selenium.webdriver.common.by import By

        links = driver.find_elements(By.TAG_NAME, "a")
        for link in links:
            href = link.get_attribute("href") or ""
            if "BuscarAvanzado.aspx" in href:
                driver.execute_script("arguments[0].click();", link)
                self._sleep(4)
                return
        driver.get(f"{BAC_BASE}/BuscarAvanzado.aspx")
        self._sleep(4)

    def _search_term(self, driver, term: str) -> str:
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import Select

        if "BuscarAvanzado.aspx" not in driver.current_url:
            self._open_advanced_search(driver)
        field = driver.find_element(By.ID, "ctl00_CPH1_txtNombrePliego")
        field.clear()
        field.send_keys(term)
        try:
            Select(driver.find_element(By.ID, "ctl00_CPH1_ddlEstadoProceso")).select_by_visible_text("Publicado")
        except Exception:
            logger.info("BAC estado filter 'Publicado' not available; continuing without state filter")
        buttons = [
            a for a in driver.find_elements(By.TAG_NAME, "a")
            if "btnListarPliegoAvanzado" in (a.get_attribute("href") or "")
        ]
        if not buttons:
            raise RuntimeError("BAC search button not found")
        driver.execute_script("arguments[0].click();", buttons[0])
        self._sleep(8)
        return driver.page_source

    def _extract_result_rows(self, html: str) -> List[dict]:
        soup = BeautifulSoup(html or "", "html.parser")
        rows = []
        for table in soup.find_all("table"):
            table_text = table.get_text(" ", strip=True)
            if not any(token in table_text.lower() for token in ("número proceso", "numero proceso", "fecha de apertura", "estado")):
                continue
            for tr in table.find_all("tr"):
                cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
                if len(cells) < 4:
                    continue
                if any("número proceso" in c.lower() or "numero proceso" in c.lower() for c in cells):
                    continue
                link = tr.find("a", href=True)
                href = link["href"] if link else None
                if href and href.startswith("javascript:"):
                    href = None
                numero = next((c for c in cells if re.search(r"\d{2,}-\d{3,}", c)), cells[0])
                title = max(cells, key=len)
                rows.append({
                    "numero": numero,
                    "title": title,
                    "cells": cells,
                    "href": urljoin(BAC_BASE, href) if href else None,
                })
        return rows

    def _row_to_licitacion(self, row: dict, term: str) -> LicitacionCreate:
        numero = (row.get("numero") or "").strip()
        cells = row.get("cells") or []
        title = (row.get("title") or f"Proceso BAC {numero}").strip()
        estado = next((c for c in cells if c.lower() in {"publicado", "en apertura", "preadjudicado", "adjudicado"}), "vigente")
        apertura_raw = next((c for c in cells if re.search(r"\d{1,2}/\d{1,2}/\d{4}", c)), None)
        opening_date = parse_date_guess(apertura_raw) if apertura_raw else None
        source_url = row.get("href") or f"{BAC_BASE}/BuscarAvanzado.aspx"
        safe_num = re.sub(r"[^A-Za-z0-9_-]+", "-", numero or str(uuid.uuid4())).strip("-")
        return LicitacionCreate(
            title=title[:500],
            organization="Buenos Aires Compras",
            publication_date=None,
            opening_date=opening_date,
            licitacion_number=numero or None,
            description=" | ".join(cells)[:2000] if cells else title,
            source_url=source_url,
            url_quality="list_only",
            status="active",
            location="Ciudad Autónoma de Buenos Aires",
            id_licitacion=f"bac-bsas-{safe_num}",
            jurisdiccion="CABA",
            tipo_procedimiento="Proceso de compra",
            tipo_acceso="BAC",
            fecha_scraping=utc_now(),
            fuente=DEFAULT_FUENTE,
            estado=estado,
            tags=["LIC_AR"],
            metadata={
                "bac_search_term": term,
                "bac_cells": cells,
                "bac_extraction": "selenium_search_seed",
                "bac_apertura_raw": apertura_raw,
            },
        )
