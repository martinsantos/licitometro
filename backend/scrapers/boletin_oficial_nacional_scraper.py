"""
Scraper for Boletín Oficial de la República Argentina - Tercera Sección (Contrataciones).
URL: https://www.boletinoficial.gob.ar/seccion/tercera

The site uses server-rendered HTML with AJAX infinite scroll pagination.
List page has <a href="/detalleAviso/tercera/{ID}/{DATE}"> links grouped under <h5> categories.
Detail pages have structured fields in table cells within #detalleAviso.
"""
from typing import List, Dict, Any, Optional
import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper
from utils.dates import last_business_days, utc_now

logger = logging.getLogger("scraper.boletin_oficial_nacional")

BASE_URL = "https://www.boletinoficial.gob.ar"


@dataclass(frozen=True)
class BoraTerceraNotice:
    """Parsed BORA third-section notice from list HTML."""

    aviso_id: str
    date_str: str
    url: str
    org: str
    title: str
    full_text: str
    category: str

    @property
    def source_record_id(self) -> str:
        return f"bora-tercera:{self.date_str}:{self.aviso_id}"

    def as_legacy_dict(self) -> Dict[str, Any]:
        return {
            "url": self.url,
            "aviso_id": self.aviso_id,
            "date_str": self.date_str,
            "org": self.org,
            "title": self.title,
            "full_text": self.full_text,
            "category": self.category,
            "source_record_id": self.source_record_id,
        }


def split_bora_org_title(text: str) -> tuple[str, str]:
    """Split BORA list text into organization and procurement title.

    The BORA list is semi-structured. Some entries expose ``p.item`` and
    ``p.item-detalle``; older/fallback HTML may only expose flattened anchor text.
    """
    clean = re.sub(r"\s+", " ", text or "").strip()
    patterns = [
        r"(.*?)\s+(Licitaci[oó]n\s+.+)",
        r"(.*?)\s+(Contrataci[oó]n\s+.+)",
        r"(.*?)\s+(Concurso\s+.+)",
        r"(.*?)\s+(Subasta\s+.+)",
        r"(.*?)\s+(Adquisici[oó]n\s+.+)",
    ]
    for pat in patterns:
        match = re.match(pat, clean, re.I)
        if match and len(match.group(1)) > 3:
            return match.group(1).strip(), match.group(2).strip()
    return "Gobierno Nacional", clean


def parse_bora_tercera_list_html(
    html: str,
    *,
    section: str = "tercera",
    base_url: str = BASE_URL,
) -> List[BoraTerceraNotice]:
    """Parse BORA third-section list HTML into stable notice records.

    Pure parser inspired by Vigia's BORA connector: it tracks rubro headers in
    document order, ignores navigation/banner links, and deduplicates repeated
    notice links such as attachment variants.
    """
    soup = BeautifulSoup(html or "", "html.parser")
    notices: List[BoraTerceraNotice] = []
    current_category = ""
    prefix = f"/detalleAviso/{section}/"

    for elem in soup.find_all(["h5", "a"]):
        if elem.name == "h5":
            category = elem.get_text(" ", strip=True)
            if category:
                current_category = category
            continue

        href = elem.get("href", "")
        if prefix not in href:
            continue

        id_match = re.search(rf"{re.escape(prefix)}([A-Za-z]?\d+)/(\d{{8}})", href)
        if not id_match:
            continue

        aviso_id, date_str = id_match.group(1), id_match.group(2)
        full_url = urljoin(base_url, href)
        full_text = elem.get_text(" ", strip=True)

        org_el = elem.select_one("p.item")
        details = [d.get_text(" ", strip=True) for d in elem.select("p.item-detalle")]
        if org_el is None and not details and not full_text:
            continue

        if org_el is not None:
            org = org_el.get_text(" ", strip=True) or "Gobierno Nacional"
            title = details[0] if details else full_text
            if len(details) > 1 and details[1] not in title:
                title = f"{title} - {details[1]}"
        else:
            org, title = split_bora_org_title(full_text)

        notices.append(
            BoraTerceraNotice(
                aviso_id=aviso_id,
                date_str=date_str,
                url=full_url,
                org=org,
                title=title,
                full_text=full_text,
                category=current_category,
            )
        )

    seen: set[str] = set()
    unique: List[BoraTerceraNotice] = []
    for notice in notices:
        if notice.source_record_id in seen:
            continue
        seen.add(notice.source_record_id)
        unique.append(notice)
    return unique


def parse_bora_tercera_detail_html(html: str, *, base_url: str = BASE_URL) -> Dict[str, Any]:
    """Extract structured fields from a BORA detail page."""
    soup = BeautifulSoup(html or "", "html.parser")
    result: Dict[str, Any] = {}

    detail_div = soup.find(id="detalleAviso") or soup.find(id="cuerpoDetalleAviso") or soup.find("body")
    if not detail_div:
        return result

    attached_files: List[Dict[str, Any]] = []
    seen_urls = set()
    for a in detail_div.select("a[href]"):
        href = (a.get("href") or "").strip()
        if not href:
            continue
        href_lower = href.lower()
        is_pdf = href_lower.endswith(".pdf") or ".pdf?" in href_lower
        is_download = "descargar" in href_lower or "download" in href_lower
        if not (is_pdf or is_download):
            continue
        full_url = urljoin(base_url, href)
        if full_url in seen_urls:
            continue
        seen_urls.add(full_url)
        name = a.get_text(strip=True) or href.rsplit("/", 1)[-1]
        attached_files.append({
            "name": name[:200],
            "url": full_url,
            "type": "pdf" if is_pdf else "link",
        })
    if attached_files:
        result["attached_files"] = attached_files

    full_text = detail_div.get_text(" ", strip=True)
    result["description"] = full_text[:2000]

    h2 = soup.find("h2")
    if h2:
        result["title"] = h2.get_text(strip=True)

    field_patterns = {
        "expediente": r"(?:Expediente\s*N[°º]?|EX)[:\s\-]*([\w\-/]+(?:\s*[\w\-/]+)*)",
        "objeto": r"Objeto\s*:\s*(.+?)(?:\.|$)",
        "budget_str": r"(?:Presupuesto\s+(?:Oficial|Estimado)|Monto\s+Estimado)[:\s]*\$?\s*([\d.,]+)",
        "opening_date_str": r"(?:Fecha\s+de\s+(?:apertura|vencimiento)|Vence)[:\s]*([\d/\-]+(?:\s+[\d:]+)?)",
        "pub_date_str": r"Fecha\s+de\s+publicaci[oó]n[:\s]*([\d/\-]+)",
    }

    for field, pattern in field_patterns.items():
        match = re.search(pattern, full_text, re.I)
        if match:
            result[field] = match.group(1).strip()

    if result.get("opening_date_str"):
        from utils.dates import parse_date_guess
        result["opening_date"] = parse_date_guess(result["opening_date_str"])

    if result.get("pub_date_str"):
        from utils.dates import parse_date_guess
        result["publication_date"] = parse_date_guess(result["pub_date_str"])

    if result.get("budget_str"):
        try:
            budget_clean = result["budget_str"].replace(".", "").replace(",", ".")
            result["budget"] = float(budget_clean)
        except (ValueError, TypeError):
            pass

    org_patterns = [
        r"^((?:Ministerio|Secretar[ií]a|Direcci[oó]n|Administraci[oó]n|Empresa|Ente|Instituto|Jefatura|Servicio|Hospital|Universidad|Armada|Gendarmer[ií]a|Polic[ií]a|Fuerza)[^.]{5,150})",
    ]
    for pat in org_patterns:
        match = re.search(pat, full_text, re.I)
        if match:
            result["org"] = match.group(1).strip()[:200]
            break

    return result


def bora_tercera_section_url_for_date(target_date: datetime, *, base_url: str = BASE_URL) -> str:
    """Build the BORA third-section URL for a specific edition date."""
    return f"{base_url}/seccion/tercera/{target_date:%Y%m%d}"


class BoletinOficialNacionalScraper(BaseScraper):
    """Scraper for Argentina's national official gazette (3rd section - procurements)."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self.section_url = config.selectors.get(
            "section_url",
            f"{BASE_URL}/seccion/tercera",
        )

    async def run(self) -> List[LicitacionCreate]:
        await self.setup()
        try:
            return await self._scrape_section()
        finally:
            await self.cleanup()

    async def _scrape_section(self) -> List[LicitacionCreate]:
        """Scrape the third section (contrataciones) of the gazette."""
        max_items = self.config.max_items or 100
        lookback_days = int(self.config.selectors.get("lookback_days", 1) or 1)
        lookback_days = max(1, min(lookback_days, 10))
        timezone = self.config.selectors.get("timezone", "America/Argentina/Buenos_Aires")
        target_dates = last_business_days(lookback_days, timezone)

        notices_by_date: List[List[Dict[str, Any]]] = []
        seen_records: set[str] = set()

        for index, target_date in enumerate(target_dates):
            section_url = (
                self.section_url
                if index == 0 and lookback_days == 1
                else bora_tercera_section_url_for_date(datetime.combine(target_date, datetime.min.time()))
            )
            html = await self.fetch_page(section_url)
            if not html:
                logger.warning("Failed to fetch Boletin Oficial Nacional section: %s", section_url)
                continue

            parsed = self._parse_notice_links(html)
            logger.info("BORA tercera %s: found %s notice links", target_date.isoformat(), len(parsed))
            day_notices: List[Dict[str, Any]] = []
            for notice in parsed:
                record_id = notice.get("source_record_id") or notice.get("aviso_id")
                if record_id in seen_records:
                    continue
                seen_records.add(record_id)
                day_notices.append(notice)
                if len(day_notices) >= max_items:
                    break

            # AJAX pagination is only used for the current/default section view.
            if index != 0:
                notices_by_date.append(day_notices)
                continue

            max_pages = int(self.config.selectors.get("max_pages", 3))
            if len(day_notices) < max_items and max_pages > 1:
                for page_num in range(1, max_pages):
                    ajax_url = f"{BASE_URL}/seccion/actualizar/0?pag={page_num}"
                    raw = await self.fetch_page(ajax_url)
                    if not raw:
                        break
                    ajax_html = raw
                    if raw.strip().startswith("{"):
                        try:
                            import json
                            data = json.loads(raw)
                            ajax_html = data.get("html", "")
                            if not data.get("hayMasResultadosSeccion", True):
                                break
                        except Exception:
                            pass
                    more = self._parse_notice_links(ajax_html)
                    if not more:
                        break
                    for notice in more:
                        record_id = notice.get("source_record_id") or notice.get("aviso_id")
                        if record_id in seen_records:
                            continue
                        seen_records.add(record_id)
                        day_notices.append(notice)
                        if len(day_notices) >= max_items:
                            break
                    logger.info("BORA tercera AJAX page %s: %s notices for current date", page_num, len(day_notices))
                    if len(day_notices) >= max_items:
                        break
            notices_by_date.append(day_notices)

            if lookback_days == 1 and len(day_notices) >= max_items:
                break

        notices = self._select_notices_for_detail(notices_by_date, max_items)

        if not notices:
            logger.error("BoletinOficialNacional: no notices found")
            return []

        # Parallel detail page fetching with semaphore
        sem = asyncio.Semaphore(5)

        async def _fetch_detail(notice):
            async with sem:
                detail_html = await self.fetch_page(notice["url"])
                if detail_html:
                    notice["detail_html"] = detail_html
                return notice

        notices = await asyncio.gather(*[_fetch_detail(n) for n in notices])

        # Build LicitacionCreate objects
        items = []
        for notice in notices:
            lic = self._build_licitacion(notice)
            if lic:
                items.append(lic)

        logger.info(f"BoletinOficialNacional: fetched {len(items)} items")
        return items

    def _select_notices_for_detail(
        self,
        notices_by_date: List[List[Dict[str, Any]]],
        max_items: int,
    ) -> List[Dict[str, Any]]:
        """Select detail fetches while preserving lookback coverage.

        BORA can publish more than ``max_items`` notices on the latest business
        day. Without a reserve, ``lookback_days`` never reaches prior editions.
        Keep most slots for the newest day, but reserve a bounded sample for
        older business days to recover missed runs without increasing load.
        """
        groups = [group for group in notices_by_date if group]
        if not groups or max_items <= 0:
            return []
        if len(groups) == 1:
            return groups[0][:max_items]

        configured_reserve = int(self.config.selectors.get("lookback_min_items_per_day", 5) or 0)
        if configured_reserve <= 0:
            return [notice for group in groups for notice in group][:max_items]

        reserve_per_older_day = min(
            configured_reserve,
            max(1, max_items // max(len(groups) * 3, 1)),
        )
        older_groups = groups[1:]
        max_reserve = max_items - 1 if groups[0] else max_items
        reserved_slots = min(max_reserve, reserve_per_older_day * len(older_groups))
        current_day_slots = max_items - reserved_slots

        selected: List[Dict[str, Any]] = []
        selected_keys: set[str] = set()

        def take(group: List[Dict[str, Any]], limit: Optional[int] = None) -> None:
            taken = 0
            for notice in group:
                if len(selected) >= max_items:
                    return
                if limit is not None and taken >= limit:
                    return
                key = notice.get("source_record_id") or notice.get("aviso_id") or notice.get("url")
                if key in selected_keys:
                    continue
                selected.append(notice)
                selected_keys.add(key)
                taken += 1

        take(groups[0], current_day_slots)
        for group in older_groups:
            take(group, reserve_per_older_day)
        for group in groups:
            take(group)

        return selected[:max_items]

    def _parse_notice_links(self, html: str) -> List[Dict[str, Any]]:
        """Extract notice links and category from HTML."""
        return [notice.as_legacy_dict() for notice in parse_bora_tercera_list_html(html)]

    def _split_org_title(self, text: str) -> tuple:
        """Split link text into organization and procurement title."""
        return split_bora_org_title(text)

    def _build_licitacion(self, notice: Dict[str, Any]) -> Optional[LicitacionCreate]:
        """Build LicitacionCreate from notice dict with optional detail HTML."""
        try:
            title = notice["title"]
            org = notice["org"]
            aviso_id = notice.get("aviso_id", "")
            category = notice.get("category", "")
            detail_html = notice.get("detail_html")

            # Parse detail page for structured fields
            description = ""
            expediente = None
            budget = None
            opening_date_parsed = None
            pub_date_parsed = None
            objeto = None

            attached_files: List[Dict[str, Any]] = []
            if detail_html:
                detail = self._parse_detail_page(detail_html, base_url=notice.get("url") or BASE_URL)
                description = detail.get("description", "")
                expediente = detail.get("expediente")
                budget = detail.get("budget")
                opening_date_parsed = detail.get("opening_date")
                pub_date_parsed = detail.get("publication_date")
                objeto = detail.get("objeto")
                attached_files = detail.get("attached_files", []) or []
                if detail.get("org"):
                    org = detail["org"]
                if detail.get("title") and len(detail["title"]) > len(title):
                    title = detail["title"]

            # Extract licitacion_number from title (e.g. "LPU-1-2026", "Licitación Pública N° 5/2024")
            licitacion_number = None
            lic_num_match = re.search(
                r"\b(LP[UN]?|CD|LPR|CP)\s*[-\s]?\s*(\d+[-/]\d+(?:[-/]\d{2,4})?)",
                title,
                re.I,
            )
            if lic_num_match:
                licitacion_number = f"{lic_num_match.group(1).upper()}-{lic_num_match.group(2)}"
            else:
                num_match = re.search(
                    r"(?:Licitaci[oó]n\s+(?:P[uú]blica|Privada)|Contrataci[oó]n\s+Directa|Concurso)\s*(?:N[°º.]?)?\s*([\d]+[-/][\d]+(?:[-/][\d]{2,4})?)",
                    title,
                    re.I,
                )
                if num_match:
                    licitacion_number = num_match.group(1)

            # Parse publication date from URL date string (YYYYMMDD)
            if not pub_date_parsed and notice.get("date_str"):
                try:
                    pub_date_parsed = datetime.strptime(notice["date_str"], "%Y%m%d")
                except ValueError:
                    pass

            publication_date = self._resolve_publication_date(
                parsed_date=pub_date_parsed, title=title,
                description=description[:1000],
            )
            opening_date = self._resolve_opening_date(
                parsed_date=opening_date_parsed, title=title,
                description=description[:1000],
                publication_date=publication_date,
            )
            estado = self._compute_estado(publication_date, opening_date)

            from utils.object_extractor import extract_objeto
            if not objeto:
                objeto = extract_objeto(title, description[:1000] if description else "", None)

            # Determine tipo_procedimiento from title
            tipo = "Contratación Pública"
            title_lower = title.lower()
            if "directa" in title_lower:
                tipo = "Contratación Directa"
            elif "privada" in title_lower:
                tipo = "Licitación Privada"
            elif "pública" in title_lower:
                tipo = "Licitación Pública"
            elif "concurso" in title_lower:
                tipo = "Concurso"

            return LicitacionCreate(
                id_licitacion=f"bo-nac-{aviso_id}" if aviso_id else f"bo-nac-{abs(hash(title))}",
                title=title[:500],
                organization=org[:200],
                publication_date=publication_date,
                opening_date=opening_date,
                description=description[:2000] if description else None,
                expedient_number=expediente,
                licitacion_number=licitacion_number,
                budget=budget,
                currency="ARS" if budget else None,
                source_url=notice["url"],
                fuente=self.config.name,
                jurisdiccion="Nacional",
                tipo_procedimiento=tipo,
                estado=estado,
                objeto=objeto,
                fecha_prorroga=None,
                fecha_scraping=utc_now(),
                attached_files=attached_files,
                status="active",
                metadata={
                    "bo_aviso_id": aviso_id,
                    "bo_category": category,
                    "source_id": "boletin_oficial_nacional",
                    "source_record_id": notice.get("source_record_id") or f"bora-tercera:{notice.get('date_str', '')}:{aviso_id}",
                    "external_id": aviso_id,
                },
            )
        except Exception as e:
            logger.warning(f"Error building BO notice: {e}")
            return None

    def _parse_detail_page(self, html: str, base_url: str = BASE_URL) -> Dict[str, Any]:
        """Extract structured fields from a detail page."""
        return parse_bora_tercera_detail_html(html, base_url=base_url)

    async def extract_licitacion_data(self, html, url):
        return None

    async def extract_links(self, html):
        return []

    async def get_next_page_url(self, html, current_url):
        return None
