"""
Generic HTML Scraper - Config-driven scraper for simple HTML sites.

Works with most WordPress, CMS, and static HTML sites that list licitaciones
in tables, cards, or article listings.

Config selectors:
  selectors.link_selector:      CSS selector for links to detail pages (default: "a[href]")
  selectors.link_pattern:       Regex filter for link hrefs (e.g., "licitacion|pliego")
  selectors.title_selector:     CSS selector for title on detail page (default: "h1, h2")
  selectors.description_selector: CSS selector for description
  selectors.date_selector:      CSS selector for publication date
  selectors.opening_date_selector: CSS selector for opening/apertura date
  selectors.organization:       Fixed org name (string)
  selectors.next_page_selector: CSS selector for next page link
  selectors.list_item_selector: CSS selector for items on list page (for inline extraction)
  selectors.list_title_selector: CSS selector for title within list item
  selectors.list_date_selector:  CSS selector for publication date within list item
  selectors.list_opening_date_selector: CSS selector for opening/apertura date within list item
  selectors.list_link_selector:  CSS selector for link within list item
  selectors.inline_mode:        If true, extract from list page directly (no detail fetch)
"""

import hashlib
import logging
import re
from datetime import datetime
from typing import List, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from models.licitacion import LicitacionCreate
from models.scraper_config import ScraperConfig
from scrapers.base_scraper import BaseScraper
from utils.dates import parse_date_guess

logger = logging.getLogger("scraper.generic_html")


class GenericHtmlScraper(BaseScraper):
    """Config-driven scraper for HTML sites with licitaciones listings."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self.sel = config.selectors or {}
        self.org = self.sel.get("organization", config.name)
        self.inline = self.sel.get("inline_mode", False)

    def _sel(self, key: str, default: str = "") -> str:
        return self.sel.get(key, default)

    def _extract_text(self, soup, selector: str) -> Optional[str]:
        if not selector:
            return None
        el = soup.select_one(selector)
        return el.get_text(strip=True) if el else None

    def _extract_date(self, soup, selector: str) -> Optional[datetime]:
        text = self._extract_text(soup, selector)
        return parse_date_guess(text) if text else None

    def _make_id(self, url: str, title: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", self.config.name.lower())[:20]
        h = hashlib.md5(url.encode()).hexdigest()[:10]
        return f"{slug}:{h}"

    def _content_hash(self, title: str, pub_date: Optional[datetime]) -> str:
        # Use stable date component - if no pub_date, use "unknown" to prevent daily hash changes
        if pub_date:
            date_str = pub_date.strftime('%Y%m%d')
        else:
            date_str = "unknown"  # Stable fallback prevents re-indexing inflation
        s = f"{(title or '').lower().strip()}|{self.config.name}|{date_str}"
        return hashlib.md5(s.encode()).hexdigest()

    def _parse_budget_text(self, text: str) -> tuple:
        """Parse Argentine budget: $1.234.567,89 -> (1234567.89, 'ARS')"""
        currency = "USD" if re.search(r"USD|U\$S", text, re.I) else "ARS"
        m = re.search(
            r"(?:presupuesto|monto|importe|valor)\s*(?:oficial|estimado)?[:\s]*\$?\s*([\d]+(?:\.[\d]{3})*(?:,[\d]{1,2})?)",
            text, re.IGNORECASE
        )
        if m:
            clean = m.group(1).replace(".", "").replace(",", ".")
            try:
                val = float(clean)
                if val > 100:
                    return val, currency
            except ValueError:
                pass
        return None, currency

    def _extract_year_from_title(self, title: str) -> Optional[int]:
        """Extract year from title like 'Licitación 13/2024' -> 2024"""
        m = re.search(r'/(\d{4})', title)
        if m:
            year = int(m.group(1))
            if 2020 <= year <= 2030:
                return year
        return None

    async def extract_licitacion_data(self, html: str, url: str) -> Optional[LicitacionCreate]:
        soup = BeautifulSoup(html, "html.parser")

        title = self._extract_text(soup, self._sel("title_selector", "h1, h2, .entry-title, .titulo"))
        if not title or len(title) < 5:
            return None

        description = self._extract_text(soup, self._sel("description_selector", ".entry-content, .descripcion, .objeto, article"))
        pub_date = self._extract_date(soup, self._sel("date_selector", "time, .date, .fecha, .published"))
        opening_date = self._extract_date(soup, self._sel("opening_date_selector", ""))

        # If no pub_date found, try to extract year from title (e.g., "13/2024" -> 2024)
        if not pub_date:
            year = self._extract_year_from_title(title)
            if year:
                pub_date = datetime(year, 1, 1)

        # Extract budget
        budget = None
        currency = "ARS"
        budget_sel = self._sel("budget_selector", "")
        if budget_sel:
            el = soup.select_one(budget_sel)
            if el:
                budget, currency = self._parse_budget_text(el.get_text(strip=True))
        if not budget:
            # Fallback: scan full page text for budget patterns
            budget, currency = self._parse_budget_text(soup.get_text())

        # Extract attached files
        attached_files = []
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            if any(ext in href.lower() for ext in [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip"]):
                attached_files.append({
                    "name": a.get_text(strip=True) or href.split("/")[-1],
                    "url": urljoin(url, href),
                    "type": href.rsplit(".", 1)[-1].lower() if "." in href else "unknown",
                })

        return LicitacionCreate(
            id_licitacion=self._make_id(url, title),
            title=title,
            organization=self.org,
            jurisdiccion="Mendoza",
            publication_date=pub_date or datetime.utcnow(),
            opening_date=opening_date,
            description=(description or "")[:3000],
            status="active",
            source_url=url,
            fuente=self.config.name,
            tipo_procedimiento=self._sel("tipo_procedimiento", "Licitación"),
            tipo_acceso="Portal Web",
            fecha_scraping=datetime.utcnow(),
            attached_files=attached_files,
            content_hash=self._content_hash(title, pub_date),
            budget=budget,
            currency=currency if budget else None,
        )

    async def extract_links(self, html: str) -> List[str]:
        soup = BeautifulSoup(html, "html.parser")
        link_sel = self._sel("link_selector", "a[href]")
        link_pattern = self._sel("link_pattern", "")
        base_url = str(self.config.url)

        links = []
        for a in soup.select(link_sel):
            href = a.get("href", "")
            if not href or href.startswith("#") or href.startswith("javascript"):
                continue
            full_url = urljoin(base_url, href)
            if link_pattern and not re.search(link_pattern, full_url, re.IGNORECASE):
                continue
            if full_url not in links and full_url != base_url.rstrip("/"):
                links.append(full_url)

        return links

    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        sel = self._sel("next_page_selector", "")
        if not sel:
            return None

        soup = BeautifulSoup(html, "html.parser")
        el = soup.select_one(sel)
        if el and el.get("href"):
            return urljoin(current_url, el["href"])
        return None

    async def _extract_inline(self, html: str) -> List[LicitacionCreate]:
        """Extract licitaciones directly from the list page without visiting detail pages."""
        soup = BeautifulSoup(html, "html.parser")
        item_sel = self._sel("list_item_selector", "")
        if not item_sel:
            return []

        items = soup.select(item_sel)
        licitaciones = []

        for item in items:
            title_sel = self._sel("list_title_selector", "h2, h3, .title, a")
            title = None
            title_el = item.select_one(title_sel)
            if title_el:
                title = title_el.get_text(strip=True)

            if not title or len(title) < 5:
                continue

            # Date filtering: skip items before min_date if configured
            date_sel = self._sel("list_date_selector", "time, .date, .fecha")
            pub_date = None
            date_el = item.select_one(date_sel)
            if date_el:
                pub_date = parse_date_guess(date_el.get_text(strip=True))

            min_date_str = self._sel("min_date", "")
            if min_date_str and pub_date:
                try:
                    min_dt = datetime.strptime(min_date_str, "%Y-%m-%d")
                    if pub_date < min_dt:
                        continue
                except ValueError:
                    pass

            # Opening date from separate selector (if configured)
            opening_date = None
            open_sel = self._sel("list_opening_date_selector", "")
            if open_sel:
                open_el = item.select_one(open_sel)
                if open_el:
                    opening_date = parse_date_guess(open_el.get_text(strip=True))

            link_sel = self._sel("list_link_selector", "a[href]")
            link_el = item.select_one(link_sel)
            url = ""
            if link_el and link_el.get("href"):
                url = urljoin(str(self.config.url), link_el["href"])

            # Use description selector if configured, otherwise use title as description
            desc_sel = self._sel("list_description_selector", "")
            if desc_sel:
                desc_el = item.select_one(desc_sel)
                description = desc_el.get_text(strip=True)[:1000] if desc_el else title
            else:
                # Extract text from each cell with separator to avoid garbled concatenation
                cells = item.find_all("td")
                if cells:
                    description = " | ".join(
                        c.get_text(strip=True) for c in cells if c.get_text(strip=True)
                    )[:1000]
                else:
                    description = item.get_text(" ", strip=True)[:1000]

            licitaciones.append(LicitacionCreate(
                id_licitacion=self._make_id(url or title, title),
                title=title,
                organization=self.org,
                jurisdiccion="Mendoza",
                publication_date=pub_date or (min(datetime.utcnow(), opening_date) if opening_date else datetime.utcnow()),
                opening_date=opening_date,
                description=description,
                status="active",
                source_url=url or str(self.config.url),
                fuente=self.config.name,
                tipo_procedimiento=self._sel("tipo_procedimiento", "Licitación"),
                tipo_acceso="Portal Web",
                fecha_scraping=datetime.utcnow(),
                content_hash=self._content_hash(title, pub_date),
            ))

        return licitaciones

    async def run(self) -> List[LicitacionCreate]:
        await self.setup()
        try:
            licitaciones: List[LicitacionCreate] = []
            start_url = str(self.config.url)
            logger.info(f"Starting generic scraper '{self.config.name}' from: {start_url}")

            current_url = start_url
            page_count = 0
            max_pages = (self.config.pagination or {}).get("max_pages", 5)

            while current_url and page_count < max_pages:
                page_count += 1
                logger.info(f"Fetching page {page_count}: {current_url}")
                html = await self.fetch_page(current_url)

                if not html:
                    logger.warning(f"No HTML returned for {current_url}")
                    break

                if self.inline:
                    # Extract directly from list page
                    inline_items = await self._extract_inline(html)
                    licitaciones.extend(inline_items)
                    logger.info(f"Inline extracted {len(inline_items)} items from page {page_count}")
                else:
                    # Standard: extract links, visit each detail page
                    links = await self.extract_links(html)
                    logger.info(f"Found {len(links)} links on page {page_count}")

                    for link in links:
                        if self.config.max_items and len(licitaciones) >= self.config.max_items:
                            break
                        detail_html = await self.fetch_page(link)
                        if detail_html:
                            lic = await self.extract_licitacion_data(detail_html, link)
                            if lic:
                                licitaciones.append(lic)
                                logger.info(f"Extracted: {lic.title[:60]}...")

                if self.config.max_items and len(licitaciones) >= self.config.max_items:
                    break

                next_url = await self.get_next_page_url(html, current_url)
                if not next_url or next_url == current_url:
                    break
                current_url = next_url

            # Deduplicate
            seen = set()
            unique = []
            for lic in licitaciones:
                if lic.id_licitacion not in seen:
                    seen.add(lic.id_licitacion)
                    unique.append(lic)

            logger.info(f"Generic scraper '{self.config.name}' complete. Found {len(unique)} licitaciones")
            return unique
        finally:
            await self.cleanup()
