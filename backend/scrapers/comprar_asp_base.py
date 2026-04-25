"""
ComprarASPBaseScraper — Base class for COMPR.AR ASP.NET WebForms scrapers.

Extracted from mendoza_compra_v2.py. Provides:
- extract_hidden_fields: ASP.NET VIEWSTATE + hidden input extraction
- extract_rows_from_list: Grid row parsing with pager-row detection
- extract_pager_args: Page navigation link extraction
- postback: HTTP POST with ResilientHttpClient (retry/circuit breaker/proxy)
"""

import logging
import re
from typing import Any, Dict, List, Optional

from bs4 import BeautifulSoup

from scrapers.base_scraper import BaseScraper

logger = logging.getLogger("scraper.comprar_asp_base")

# Default table ID patterns for different COMPR.AR instances
DEFAULT_TABLE_PATTERNS = [
    "GridListaPliegosAperturaProxima",
    "GridListaPliegos",
    "grdListadoProcesos",
    "GridListaProcesos",
    "grdPliegos",
    "grilla",
]


class ComprarASPBaseScraper(BaseScraper):
    """Base for ASP.NET WebForms scrapers (COMPR.AR Mendoza, Nacional, BAC)."""

    table_id_pattern: str = ""

    def _find_grid_table(self, html: str) -> Optional[BeautifulSoup]:
        """Find the grid table in the listing page using configured pattern."""
        soup = BeautifulSoup(html, "html.parser")
        patterns = [self.table_id_pattern] if self.table_id_pattern else DEFAULT_TABLE_PATTERNS
        for pat in patterns:
            table = soup.find("table", {"id": re.compile(pat)})
            if table:
                return table
        return None

    @staticmethod
    def _is_pager_row(text: str) -> bool:
        """Detect ASP.NET grid pager rows (e.g. '1 2 3 4 5 6 7 8 9 10 ...')."""
        return bool(re.match(r"^[\d\s.…]+$", text.strip()))

    @staticmethod
    def extract_hidden_fields(html: str) -> Dict[str, str]:
        """Extract ASP.NET hidden fields (VIEWSTATE, EVENTVALIDATION, etc.)."""
        soup = BeautifulSoup(html, "html.parser")
        fields: Dict[str, str] = {}
        for name in [
            "__VIEWSTATE", "__EVENTVALIDATION", "__VIEWSTATEGENERATOR",
            "__EVENTTARGET", "__EVENTARGUMENT",
        ]:
            inp = soup.find("input", {"name": name})
            if inp and inp.get("value") is not None:
                fields[name] = inp.get("value")
        for inp in soup.find_all("input", {"type": "hidden"}):
            name = inp.get("name")
            if name and name not in fields:
                fields[name] = inp.get("value", "")
        return fields

    def extract_rows_from_list(self, html: str, min_cols: int = 6) -> List[Dict[str, Any]]:
        """Extract row data from a COMPR.AR listing table.

        Returns list of dicts with: target, numero, title, tipo, apertura,
        estado, unidad, servicio_admin.
        """
        table = self._find_grid_table(html)
        if not table:
            return []
        rows = []
        for row in table.find_all("tr"):
            cols = row.find_all("td")
            if len(cols) < min_cols:
                continue
            link = cols[0].find("a", href=True)
            target = None
            if link:
                m = re.search(
                    r"__doPostBack\('([^']+)'\s*,\s*'([^']*)'\)",
                    link.get("href", ""),
                )
                if m:
                    target = m.group(1)
            numero = cols[0].get_text(" ", strip=True)
            if self._is_pager_row(numero):
                continue
            title = cols[1].get_text(" ", strip=True) if len(cols) > 1 else None
            tipo = cols[2].get_text(" ", strip=True) if len(cols) > 2 else None
            apertura = cols[3].get_text(" ", strip=True) if len(cols) > 3 else None
            estado = cols[4].get_text(" ", strip=True) if len(cols) > 4 else None
            unidad = cols[5].get_text(" ", strip=True) if len(cols) > 5 else None
            servicio_admin = cols[6].get_text(" ", strip=True) if len(cols) > 6 else None
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

    @staticmethod
    def extract_pager_args(html: str) -> Dict[str, List[str]]:
        """Extract pagination args from ASP.NET grid pager links.

        Returns {target_name: [Page$1, Page$2, ...]} for each grid.
        """
        soup = BeautifulSoup(html, "html.parser")
        pages: Dict[str, List[str]] = {}
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            m = re.search(
                r"__doPostBack\('([^']+)'\s*,\s*'([^']*)'\)", href
            )
            if not m:
                continue
            target, arg = m.group(1), m.group(2)
            if arg.startswith("Page$"):
                pages.setdefault(target, []).append(arg)
        for k, v in list(pages.items()):
            pages[k] = list(dict.fromkeys(v))
        return pages

    async def postback(self, url: str, fields: Dict[str, str]) -> Optional[str]:
        """Execute ASP.NET postback via ResilientHttpClient.

        Uses self.http.post() which provides retry, circuit breaker,
        proxy routing, and User-Agent rotation.
        """
        try:
            headers = {"Referer": url}
            return await self.http.post(str(url), data=fields, headers=headers)
        except Exception as e:
            logger.error(f"Postback error for {url[:60]}: {e}")
            return None
