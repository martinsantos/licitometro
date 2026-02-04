from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import List, Optional

from bs4 import BeautifulSoup

from models.licitacion import LicitacionCreate
from models.scraper_config import ScraperConfig
from scrapers.base_scraper import BaseScraper
from utils.dates import last_business_days_set, parse_date_guess

logger = logging.getLogger("scraper.boletin_oficial_mendoza")


class BoletinOficialMendozaScraper(BaseScraper):
    """
    Scraper for Boletin Oficial de Mendoza.

    Uses the official Boletin Oficial API endpoints discovered in the front-end module:
    - https://portalgateway.mendoza.gov.ar/api/boe/advance-search
    - https://portalgateway.mendoza.gov.ar/api/boe/detail (optional)

    Optional selectors/config:
    - selectors.keywords: list of keyword strings for filtering (default includes licitaciones terms)
    - selectors.timezone: tz name (default America/Argentina/Mendoza)
    - selectors.business_days_window: int (default 4)
    - pagination.advance_search_url: override API endpoint
    - pagination.tipo_boletin: 1 or 2 (required by API, default 2)
    """

    DEFAULT_TZ = "America/Argentina/Mendoza"
    DEFAULT_BUSINESS_DAYS_WINDOW = 4  # hoy + 3 dias habiles hacia atras

    def __init__(self, config: ScraperConfig):
        super().__init__(config)

    def _business_date_range(self) -> tuple[str, str]:
        days = sorted(
            last_business_days_set(
                count=self.config.selectors.get(
                    "business_days_window", self.DEFAULT_BUSINESS_DAYS_WINDOW
                ),
                tz_name=self.config.selectors.get("timezone", self.DEFAULT_TZ),
            )
        )
        if not days:
            now = datetime.utcnow().date()
            return now.isoformat(), now.isoformat()
        return days[0].isoformat(), days[-1].isoformat()

    def _parse_date_from_text(self, text: str) -> Optional[datetime]:
        parsed = parse_date_guess(text)
        if parsed:
            return parsed
        match = re.search(r"(\\d{1,2}[/-]\\d{1,2}[/-]\\d{4})", text)
        if match:
            return parse_date_guess(match.group(1))
        return None

    def _in_business_window(self, dt: Optional[datetime]) -> bool:
        if not dt:
            return False
        tz_name = self.config.selectors.get("timezone", self.DEFAULT_TZ)
        window_days = self.config.selectors.get(
            "business_days_window", self.DEFAULT_BUSINESS_DAYS_WINDOW
        )
        allowed = last_business_days_set(count=window_days, tz_name=tz_name)
        return dt.date() in allowed

    async def extract_licitacion_data(self, html: str, url: str) -> Optional[LicitacionCreate]:
        # Not used: Boletin is processed as a list page
        return None

    async def extract_links(self, html: str) -> List[str]:
        # Not used: Boletin is processed as a list page
        return []

    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        # API-based search: no pagination handled here
        return None

    async def _fetch_advance_search(self, keyword: Optional[str] = None, tipo_busqueda: str = "NORMA") -> Optional[str]:
        pagination = self.config.pagination or {}
        advance_url = pagination.get(
            "advance_search_url",
            "https://portalgateway.mendoza.gov.ar/api/boe/advance-search",
        )
        tipo_boletin = pagination.get("tipo_boletin", 2)
        fecha_des, fecha_has = self._business_date_range()

        payload = {
            "tipo_busqueda": tipo_busqueda,
            "tipo_boletin": str(tipo_boletin),
            "fechaPubDes": fecha_des,
            "fechaPubHas": fecha_has,
            "texto": keyword or "",
        }

        try:
            async with self.session.post(advance_url, data=payload) as response:
                if response.status < 200 or response.status >= 300:
                    logger.error(f"Advance search failed {response.status} for keyword={keyword}")
                    return None
                return await response.text()
        except Exception as exc:
            logger.error(f"Advance search error: {exc}")
            return None

    def _parse_results_html(self, html: str, keyword: Optional[str]) -> List[LicitacionCreate]:
        soup = BeautifulSoup(html, "html.parser")
        items = soup.select("table#list-table tbody tr.toggle-head")
        licitaciones: List[LicitacionCreate] = []

        strict_pattern = self.config.selectors.get(
            "strict_filter_regex",
            r"\\b(licitaci[oó]n|contrataci[oó]n|concurso|convocatoria|compulsa|comparaci[oó]n de precios|adjudicaci[oó]n)\\b",
        )
        strict_re = None
        if strict_pattern:
            strict_re = re.compile(strict_pattern, re.IGNORECASE)

        for row in items:
            cols = row.find_all("td")
            if len(cols) < 5:
                continue

            tipo = cols[0].get_text(strip=True)
            norma = cols[1].get_text(strip=True)
            fec_pro = cols[2].get_text(strip=True)
            fec_pub = cols[3].get_text(strip=True)
            boletin_col = cols[4]
            boletin_link = None
            boletin_num = boletin_col.get_text(strip=True)
            link = boletin_col.find("a", href=True)
            if link:
                boletin_link = link.get("href")

            pub_dt = self._parse_date_from_text(fec_pub)
            if not self._in_business_window(pub_dt):
                continue

            # Find the next toggle-body for extra info
            details_row = row.find_next_sibling("tr", class_="toggle-body")
            description = None
            organization = "Boletin Oficial Mendoza"
            attached_files = []

            if details_row:
                details_text = details_row.get_text(" ", strip=True)
                description = details_text[:1000] if details_text else None
                # Try to extract Origen
                origin_match = re.search(r"Origen:\\s*([A-ZÁÉÍÓÚÑ0-9 ,.-]+)", details_text or "")
                if origin_match:
                    organization = origin_match.group(1).strip()
                # Try to extract page number for PDF deep link
                page_num = None
                page_match = re.search(r"(?:Pág\\.?|Página)\\s*(\\d+)", details_text or "", re.IGNORECASE)
                if page_match:
                    page_num = page_match.group(1)
                # Attach 'Texto Publicado' link if present
                texto_link = details_row.find("a", string=re.compile(r"Texto Publicado", re.IGNORECASE))
                if texto_link and texto_link.get("href"):
                    pdf_url = texto_link.get("href")
                    if page_num:
                        pdf_url = f"{pdf_url}#page={page_num}"
                    attached_files.append(
                        {
                            "name": "Texto Publicado",
                            "url": pdf_url,
                            "type": "pdf",
                        }
                    )

            # Second strict filter to reduce noise
            if strict_re:
                combined_text = " ".join(filter(None, [tipo, norma, description or "", keyword or ""]))
                if not strict_re.search(combined_text):
                    continue

            if boletin_link:
                pdf_url = boletin_link
                page_match = re.search(r"(?:Pág\\.?|Página)\\s*(\\d+)", (description or ""), re.IGNORECASE)
                if page_match:
                    pdf_url = f"{boletin_link}#page={page_match.group(1)}"
                attached_files.append(
                    {"name": f"Boletin {boletin_num}", "url": pdf_url, "type": "pdf"}
                )

            title = f"{tipo} {norma}".strip()
            id_licitacion = f"boletin-mza:norma:{norma}:{pub_dt.date().isoformat() if pub_dt else 'unknown'}"

            licitacion = LicitacionCreate(
                id_licitacion=id_licitacion,
                title=title or "Boletin Oficial Mendoza",
                organization=organization,
                jurisdiccion="Mendoza",
                publication_date=pub_dt or datetime.utcnow(),
                licitacion_number=norma or None,
                description=description,
                status="active",
                source_url=boletin_link or self.config.url,
                fuente="Boletin Oficial Mendoza",
                tipo_procedimiento="Boletin Oficial - Norma",
                tipo_acceso="Boletin Oficial",
                fecha_scraping=datetime.utcnow(),
                attached_files=attached_files,
                keywords=[keyword] if keyword else [],
            )
            licitaciones.append(licitacion)

        return licitaciones

    async def run(self) -> List[LicitacionCreate]:
        await self.setup()
        try:
            include_all = self.config.selectors.get("include_all", False)
            keywords = self.config.selectors.get(
                "keywords",
                [
                    "licitacion",
                    "licitación",
                    "contratacion",
                    "contratación",
                    "concurso",
                    "convocatoria",
                    "compulsa",
                    "comparacion de precios",
                    "adjudicacion",
                    "adjudicación",
                ],
            )
            licitaciones: List[LicitacionCreate] = []
            if include_all:
                tipos = self.config.selectors.get("include_types", ["NORMA", "EDICTO"])
                for t in tipos:
                    html = await self._fetch_advance_search(keyword=None, tipo_busqueda=t)
                    if html:
                        licitaciones.extend(self._parse_results_html(html, keyword=None))
            else:
                for keyword in keywords:
                    html = await self._fetch_advance_search(keyword=keyword, tipo_busqueda="NORMA")
                    if not html:
                        continue
                    licitaciones.extend(self._parse_results_html(html, keyword=keyword))
                    if self.config.max_items and len(licitaciones) >= self.config.max_items:
                        break
                # Fallback: if no results with keywords, run a broad query and rely on strict filter
                if not licitaciones:
                    html = await self._fetch_advance_search(keyword=None, tipo_busqueda="NORMA")
                    if html:
                        licitaciones.extend(self._parse_results_html(html, keyword=None))
            # Ordenar por fecha de publicacion (mas reciente primero)
            licitaciones.sort(key=lambda l: l.publication_date, reverse=True)
            return licitaciones
        finally:
            await self.cleanup()
