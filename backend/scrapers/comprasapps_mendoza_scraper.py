"""
ComprasApps Mendoza Scraper - GeneXus Servlet hli00049

Scrapes ALL licitaciones from comprasapps.mendoza.gov.ar covering every CUC
(provincial + 17 municipalities). This is the most complete source of
Mendoza procurement data.

Protocol:
1. GET initial page → extract session cookies + GXState JSON
2. POST with _EventName='EENTER.' + correct vXXX fields → search results
3. Parse grid data from LicitacionesContainerDataV hidden input (JSON array)
4. Paginate by updating LICITACIONES_nFirstRecordOnPage in GXState

Correct field names (discovered via live protocol analysis):
- vEJER: Fiscal year (= filter, must search each year separately)
- vLICNRO: Process number (0=all)
- vLICUCFIL: CUC filter (0=all)
- vFCHDESDE / vFCHHASTA: Opening date range (dd/mm/yy or "  /  /  ")
- vESTFILTRO: Estado (V=Vigente, P=En proceso, A=Adjudicada, T=Todas)
- vLICABCONTIPOSEL: Tipo (""=Todas, P=Publica, V=Privada, D=Directa)
- vRUBRO: Category (000000=all)
- vLICUC: CUC/Reparticion (0=all)
- vFINANSEL: Funding (""=Todas)
- GXState: JSON session state (required)
- _EventName: 'EENTER.' for search, '' for pagination
"""

from typing import List, Dict, Any, Optional
import asyncio
import logging
from bs4 import BeautifulSoup
from datetime import datetime
from utils.time import utc_now
import re
import uuid
import sys
import hashlib
import json
from pathlib import Path
import aiohttp

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper
from utils.dates import parse_date_guess

logger = logging.getLogger("scraper.comprasapps_mendoza")

# CUC code → Organization name mapping
CUC_NAMES = {
    # Provincial government
    "1": "Cámara de Senadores",
    "20": "Dir. Gral. de Crédito al Sector Público",
    "40": "M.I.P.I.P.",
    "42": "Ministerio de Salud y Deportes",
    "47": "Subsecretaría de Deportes",
    "100": "Hospital Dr. Ramón Carrillo",
    "101": "Gobierno de Mendoza",
    "116": "Ministerio de Seguridad",
    "120": "Dirección de Atención Adultos Mayores",
    "127": "Servicio Penitenciario",
    "132": "Ecoparque Mendoza",
    "156": "Subsecretaría de Transporte",
    "159": "Fondo de Inversión y Desarrollo Social",
    "214": "Vialidad Provincial",
    "275": "Hospital Malargüe",
    "276": "Hospital Saporiti",
    # Entes autárquicos (500s)
    "501": "DGE - Dirección General de Escuelas",
    "502": "EPAS",
    "503": "EPRE",
    "504": "IPV Mendoza",
    "505": "Irrigación",
    "506": "ISCAMEN",
    "507": "Tribunal de Cuentas",
    "508": "OSEP",
    "509": "Vialidad Mendoza",
    "510": "Poder Judicial",
    "511": "Legislatura",
    "512": "AYSAM",
    "519": "Instituto Provincial de la Vivienda",
    # Municipios (600s)
    "601": "Municipalidad de Capital",
    "602": "Municipalidad de General Alvear",
    "603": "Municipalidad de Godoy Cruz",
    "604": "Municipalidad de Guaymallén",
    "605": "Municipalidad de Junín",
    "606": "Municipalidad de La Paz",
    "607": "Municipalidad de Las Heras",
    "608": "Municipalidad de Lavalle",
    "609": "Municipalidad de Luján de Cuyo",
    "610": "Municipalidad de Maipú",
    "611": "Municipalidad de Malargüe",
    "612": "Municipalidad de Rivadavia",
    "613": "Municipalidad de San Carlos",
    "614": "Municipalidad de San Martín",
    "615": "Municipalidad de San Rafael",
    "616": "Municipalidad de Santa Rosa",
    "617": "Municipalidad de Tunuyán",
    "618": "Municipalidad de Tupungato",
    "620": "COINES (Consorcio Intermunicipal RSU)",
    "621": "COINCE",
    # Otros
    "961": "Fondo para la Transformación y Crecimiento",
}

# Grid column indices in LicitacionesContainerDataV JSON array
COL_NUMERO = 0        # e.g. "3/2026-616"
COL_TIPO = 1          # e.g. "Compra Directa", "Licitacion Publica"
COL_ORG_NAME = 2      # Organization name
COL_ORG_NAME2 = 3     # Organization name variant
COL_APERTURA_DATE = 6  # dd/mm/yy
COL_APERTURA_TIME = 7  # HH:mm
COL_ESTADO = 9         # Vigente, En Proceso, Adjudicada, Sin Efecto
COL_TITULO_FULL = 10   # Full title/description
COL_TITULO_SHORT = 11  # Truncated title
COL_ANIO = 14          # Fiscal year
COL_SEQ = 15           # Sequential number
COL_TIPO_CODE = 17     # Type code (1=Directa, 4=Publica)
COL_CUC = 18           # CUC code
COL_TIPO_LETTER = 20   # D/P/V

ROWS_PER_PAGE = 10


class ComprasAppsMendozaScraper(BaseScraper):
    """
    Scraper for ComprasApps Mendoza (GeneXus servlet hli00049).
    Fetches ALL licitaciones across all CUCs.
    """

    BASE_URL = "https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00049"

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self._gxstate_raw = ""  # Raw GXState JSON string from page
        self._gxstate = {}      # Parsed GXState dict
        self._cookies = {}

    # Short per-request timeout to avoid burning the total 1200s budget on slow requests
    _REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=20, connect=5, sock_read=15)

    async def _init_session(self) -> bool:
        """GET initial page to establish session and extract GXState."""
        try:
            # ResilientHttpClient handles proxy routing, retry, and 522 backoff automatically
            html = await self.http.fetch(self.BASE_URL)
            if not html:
                logger.error("Init failed: no response from ComprasApps")
                return False

            soup = BeautifulSoup(html, "html.parser")
            gxstate_input = soup.find("input", {"name": "GXState"})
            if not gxstate_input or not gxstate_input.get("value"):
                logger.error("No GXState found in initial page")
                return False

            self._gxstate_raw = gxstate_input["value"]
            try:
                self._gxstate = json.loads(self._gxstate_raw)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse GXState JSON: {e}")
                return False

            logger.info("Session initialized, GXState extracted "
                       f"({len(self._gxstate_raw)} chars)")
            return True

        except Exception as e:
            logger.error(f"Session init failed: {e}")
            return False

    def _build_search_form(self, anio: int = 2026, estado: str = "T",
                           cuc: str = "0") -> Dict[str, str]:
        """Build POST form data for search."""
        return {
            "vEJER": str(anio),
            "vLICNRO": "0",
            "vLICUCFIL": "0",
            "vFCHDESDE": "  /  /  ",
            "vFCHHASTA": "  /  /  ",
            "vESTFILTRO": estado,
            "vLICABCONTIPOSEL": "",
            "vRUBRO": "000000",
            "vLICUC": cuc,
            "vFINANSEL": "",
            "_EventName": "EENTER.",
            "GXState": self._gxstate_raw,
        }

    def _build_page_form(self, page_offset: int) -> Dict[str, str]:
        """Build POST form data for pagination."""
        # Update the GXState with new page offset
        gxstate = dict(self._gxstate)
        gxstate["LICITACIONES_nFirstRecordOnPage"] = page_offset
        gxstate_raw = json.dumps(gxstate, separators=(",", ":"))

        return {
            "vEJER": str(self._search_anio),
            "vLICNRO": "0",
            "vLICUCFIL": "0",
            "vFCHDESDE": "  /  /  ",
            "vFCHHASTA": "  /  /  ",
            "vESTFILTRO": self._search_estado,
            "vLICABCONTIPOSEL": "",
            "vRUBRO": "000000",
            "vLICUC": self._search_cuc,
            "vFINANSEL": "",
            "_EventName": "",
            "GXState": gxstate_raw,
        }

    async def _post_search(self, form_data: Dict[str, str]) -> Optional[str]:
        """Execute a POST search and return HTML."""
        try:
            post_headers = {"Referer": self.BASE_URL}
            # ResilientHttpClient handles proxy routing, retry, 522 backoff, and SSL automatically
            html = await self.http.post(self.BASE_URL, data=form_data, headers=post_headers)
            if not html:
                logger.error(f"POST search failed for ComprasApps")
                return None

            # Update GXState from response for pagination
            soup = BeautifulSoup(html, "html.parser")
            gxstate_input = soup.find("input", {"name": "GXState"})
            if gxstate_input and gxstate_input.get("value"):
                self._gxstate_raw = gxstate_input["value"]
                try:
                    self._gxstate = json.loads(self._gxstate_raw)
                except json.JSONDecodeError:
                    pass
            return html
        except Exception as e:
            logger.error(f"POST search failed: {e}")
            return None

    async def _fetch_detail(self, row: List[Any]) -> Optional[Dict[str, Any]]:
        """Fetch detail page for a grid row via direct URL to hli00048 servlet.

        The detail popup loads in an iframe pointing to:
        hli00048?{año},{CUC},{tipo},{nro},gxPopupLevel=0;

        This URL is publicly accessible — no session/CSRF required.
        Returns dict with parsed fields or None on failure.
        """
        try:
            anio = str(row[COL_ANIO]) if len(row) > COL_ANIO else ""
            nro = str(row[COL_SEQ]) if len(row) > COL_SEQ else ""
            tip_num = str(row[COL_TIPO_CODE]) if len(row) > COL_TIPO_CODE else ""
            cuc_num = str(row[COL_CUC]) if len(row) > COL_CUC else ""

            if not anio or not nro:
                return None

            detail_url = (
                f"https://comprasapps.mendoza.gov.ar/Compras/servlet/"
                f"hli00048?{anio},{cuc_num},{tip_num},{nro}"
            )

            html = await self.fetch_page(detail_url)
            if not html:
                return None

            return self._parse_detail_html(html)
        except Exception as e:
            logger.debug(f"Detail fetch failed: {e}")
            return None

    def _parse_detail_html(self, html: str) -> Dict[str, Any]:
        """Parse hli00048 detail page HTML.

        Priority strategy:
        1. GXState JSON — LICAPRESUP (raw budget), LICAMONEDA, all MovimientosContainerData URLs
        2. Direct input fields (vPRESUPUESTO fallback, vVALORPLIEGO)
        3. Regex on raw HTML for any remaining mendoza.gov.ar file URLs
        4. Regex on full text for description, expediente, other fields
        """
        soup = BeautifulSoup(html, "html.parser")
        result: Dict[str, Any] = {}

        # ── 1. GXState JSON (richest source) ──────────────────────────────────
        pliego_urls: List[str] = []
        gx_input = soup.find("input", {"name": "GXState"})
        if gx_input:
            try:
                gxstate = json.loads(gx_input.get("value", "{}"))

                # Budget: LICAPRESUP is raw decimal "10380000,00" — no thousands dots
                licapresup = gxstate.get("LICAPRESUP", "").strip()
                if licapresup:
                    result["licapresup"] = licapresup

                # Pliego value: LICAPLIVAL (cost of the pliego document)
                licaplival = gxstate.get("LICAPLIVAL", "").strip()
                if licaplival and licaplival.strip("0 ,."):
                    result["licaplival"] = licaplival

                # Currency from LICAMONEDA (direct field in GXState or input)
                moneda_input = soup.find("input", {"name": "LICAMONEDA"})
                if moneda_input:
                    result["currency_raw"] = (moneda_input.get("value") or "").strip()

                # All file URLs from MovimientosContainerData nested JSON
                # Structure: {"0": {"Props": [["vLIHARCHIVO_0001","https://...","..."], ...]}, ...}
                mov_data_str = gxstate.get("MovimientosContainerData", "{}")
                if isinstance(mov_data_str, str) and mov_data_str.startswith("{"):
                    try:
                        mov_data = json.loads(mov_data_str)
                        i = 0
                        while str(i) in mov_data:
                            row = mov_data[str(i)]
                            for prop in (row.get("Props") or []):
                                if not prop or len(prop) < 2:
                                    continue
                                fname = str(prop[0])
                                fval = str(prop[1]).strip() if prop[1] else ""
                                if "LIHARCHIVO" in fname and fval.startswith("http"):
                                    if fval not in pliego_urls:
                                        pliego_urls.append(fval)
                            i += 1
                    except (json.JSONDecodeError, TypeError, AttributeError) as e:
                        logger.debug(f"MovimientosContainerData parse: {e}")

                # Fallback: LIHARCHIVO top-level key (last attached file)
                if not pliego_urls:
                    liharchivo = gxstate.get("LIHARCHIVO", "").strip()
                    if liharchivo:
                        pliego_urls.append(
                            f"https://www.mendoza.gov.ar/compras/files/Licita/{liharchivo}"
                        )
                        result["liharchivo"] = liharchivo

            except (json.JSONDecodeError, KeyError) as e:
                logger.debug(f"GXState parse in detail page: {e}")

        # ── 2. Direct input fields (fallback for budget/valor) ────────────────
        def _input_val(name: str) -> str:
            inp = soup.find("input", {"name": name})
            if inp:
                return (inp.get("value") or "").strip()
            span = soup.find(id=f"span_{name}")
            if span:
                return span.get_text(strip=True)
            return ""

        # Budget fallback from vPRESUPUESTO (e.g. "    9.286.725,00" with dots)
        if not result.get("licapresup"):
            presupuesto_raw = _input_val("vPRESUPUESTO")
            if presupuesto_raw:
                result["budget_raw"] = presupuesto_raw

        # Valor del pliego fallback
        if not result.get("licaplival"):
            valor_pliego_raw = _input_val("vVALORPLIEGO")
            if valor_pliego_raw and valor_pliego_raw.strip("0 ,."):
                result["valor_pliego"] = valor_pliego_raw

        # ── 3. Regex scan for any remaining mendoza.gov.ar/compras/files URLs ──
        for u in re.findall(
            r'https?://(?:www\.)?mendoza\.gov\.ar/compras/files/[^\s"\'\\>]+\.(?:zip|pdf|ZIP|PDF)',
            html,
        ):
            if u not in pliego_urls:
                pliego_urls.append(u)

        if pliego_urls:
            result["pliego_urls"] = pliego_urls

        # ── 4. Regex on full text for remaining fields ─────────────────────────
        full_text = soup.get_text(" ", strip=True)

        # Currency fallback from text
        if not result.get("currency_raw"):
            m = re.search(r"Moneda\s+(PESOS|DOLARES|USD|EUROS)", full_text, re.I)
            if m:
                result["currency_raw"] = m.group(1)

        # Budget fallback from text
        if not result.get("licapresup") and not result.get("budget_raw"):
            m = re.search(
                r"Presupuesto\s+Oficial\s+([\d]+(?:\.[\d]{3})*(?:,[\d]{1,2})?)",
                full_text,
            )
            if m:
                result["budget_raw"] = m.group(1)

        # Description
        m = re.search(
            r"Descripci[oó]n\s+(.+?)(?:Presupuesto|Valor\s+del\s+pliego|Moneda|$)",
            full_text,
            re.I | re.DOTALL,
        )
        if m:
            desc = m.group(1).strip()
            if len(desc) > 5:
                result["description"] = desc[:2000]

        # Expediente
        m = re.search(r"Expediente\s+Nro\s*(\d+)\s*Letra\s*.*?A[ñn]o\s*(\d{4})", full_text, re.I)
        if m:
            result["expedient_raw"] = f"Nro {m.group(1)} Año {m.group(2)}"

        # Fecha/hora apertura
        m = re.search(r"Fecha\s+de\s+apertura\s+(\d{1,2}/\d{1,2}/\d{2,4})", full_text, re.I)
        if m:
            result["opening_date_str"] = m.group(1)
        m = re.search(r"Hora\s+de\s+apertura\s+(\d{1,2}:\d{2})", full_text, re.I)
        if m:
            result["opening_time_str"] = m.group(1)

        # Repartición destino
        m = re.search(r"Repartici[oó]n\s+destino\s+(.+?)(?:Norma|Tipo|$)", full_text, re.I)
        if m:
            result["reparticion_destino"] = m.group(1).strip()[:200]

        # Norma Legal
        m = re.search(r"Norma\s+Legal\s+Tipo\s+(\w+)\s+N[°º]?\s*(\d+)\s*.*?A[ñn]o\s*(\d{4})", full_text, re.I)
        if m:
            result["norma_legal"] = f"{m.group(1)} {m.group(2)}/{m.group(3)}"

        # Garantía de oferta
        m = re.search(r"Garant[ií]a\s+de\s+oferta\s+(.+?)(?:Plazo|Lugar|Vigencia|$)", full_text, re.I)
        if m:
            result["garantia_oferta"] = m.group(1).strip()[:200]

        # Organismo licitante
        m = re.search(r"Organismo\s+licitante\s+(.+?)(?:Domicilio|Financiamiento|$)", full_text, re.I)
        if m:
            result["organismo_licitante"] = m.group(1).strip()[:200]

        # Financiamiento
        m = re.search(r"Financiamiento\s+([\w\s]+?)(?:Descargue|Registro|$)", full_text, re.I)
        if m:
            result["financiamiento"] = m.group(1).strip()[:100]

        # ── Post-processing ───────────────────────────────────────────────────

        # Parse budget: LICAPRESUP is "10380000,00" (decimal comma, no thousands dots)
        if result.get("licapresup"):
            try:
                budget = float(result["licapresup"].replace(",", "."))
                if budget > 0:
                    result["budget_parsed"] = budget
            except (ValueError, TypeError):
                pass
        elif result.get("budget_raw"):
            # vPRESUPUESTO uses Spanish format: "9.286.725,00"
            try:
                budget = float(result["budget_raw"].replace(".", "").replace(",", "."))
                if budget > 0:
                    result["budget_parsed"] = budget
            except (ValueError, TypeError):
                pass

        # Parse currency
        currency_raw = (result.get("currency_raw") or "").upper()
        if "PESO" in currency_raw:
            result["currency"] = "ARS"
        elif "DOLAR" in currency_raw or "USD" in currency_raw:
            result["currency"] = "USD"
        else:
            result["currency"] = "ARS"

        # Parse expediente
        if result.get("expedient_raw"):
            m = re.search(r"Nro?\s*(\d+).*?A[ñn]o\s*(\d{4})", result["expedient_raw"], re.I)
            if m:
                result["expedient_number"] = f"{m.group(1)}/{m.group(2)}"

        return result

    def _extract_grid_data(self, html: str) -> List[List[Any]]:
        """Extract grid rows from LicitacionesContainerDataV hidden input."""
        soup = BeautifulSoup(html, "html.parser")

        # Primary: look for LicitacionesContainerDataV hidden input
        container = soup.find("input", {"name": "LicitacionesContainerDataV"})
        if container and container.get("value"):
            try:
                data = json.loads(container["value"])
                if isinstance(data, list):
                    logger.info(f"Extracted {len(data)} rows from LicitacionesContainerDataV")
                    return data
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse grid JSON: {e}")

        # Fallback: try to find grid data in any hidden input with JSON array
        for inp in soup.find_all("input", {"type": "hidden"}):
            val = inp.get("value", "")
            if val.startswith("[[") and len(val) > 50:
                try:
                    data = json.loads(val)
                    if isinstance(data, list) and len(data) > 0:
                        logger.info(f"Extracted {len(data)} rows from {inp.get('name', 'unknown')}")
                        return data
                except json.JSONDecodeError:
                    continue

        # Last fallback: parse HTML table
        return self._extract_from_html_table(soup)

    def _extract_from_html_table(self, soup: BeautifulSoup) -> List[List[Any]]:
        """Fallback: extract data from HTML table rows."""
        rows = []
        # Look for table with licitacion data
        for table in soup.find_all("table"):
            trs = table.find_all("tr")
            if len(trs) < 2:
                continue
            for tr in trs[1:]:  # skip header
                cells = tr.find_all("td")
                if len(cells) >= 6:
                    row_data = [c.get_text(" ", strip=True) for c in cells]
                    # Pad to expected length
                    while len(row_data) < 21:
                        row_data.append("")
                    rows.append(row_data)
        if rows:
            logger.info(f"Extracted {len(rows)} rows from HTML table fallback")
        return rows

    def _row_to_licitacion(self, row: List[Any],
                           detail_data: Optional[Dict[str, Any]] = None) -> Optional[LicitacionCreate]:
        """Convert a grid row to a LicitacionCreate object."""
        try:
            # Safe accessor
            def col(idx, default=""):
                return str(row[idx]).strip() if idx < len(row) and row[idx] else default

            numero = col(COL_NUMERO)
            if not numero or numero == "0":
                return None

            tipo = col(COL_TIPO, "Proceso de compra")
            org_name = col(COL_ORG_NAME) or col(COL_ORG_NAME2)
            apertura_date = col(COL_APERTURA_DATE)
            apertura_time = col(COL_APERTURA_TIME)
            estado = col(COL_ESTADO, "")
            if not estado:
                # GeneXus returns blank COL_ESTADO when filtered; infer from search filter
                search_estado = getattr(self, "_search_estado", "")
                estado = {"A": "Adjudicada", "V": "Vigente", "P": "En Proceso"}.get(search_estado, "Vigente")
            titulo = col(COL_TITULO_FULL) or col(COL_TITULO_SHORT) or numero
            cuc_code = col(COL_CUC)

            # Resolve organization name from CUC mapping
            if not org_name and cuc_code:
                org_name = CUC_NAMES.get(cuc_code, f"CUC {cuc_code}")
            organization = org_name or "Gobierno de Mendoza"

            # Parse opening date
            opening_date_parsed = None
            if apertura_date and apertura_date.strip() not in ("", "/  /"):
                date_str = apertura_date
                if apertura_time and apertura_time.strip():
                    # Normalize time variants from ComprasApps:
                    # "08;00"→"08:00", "09.00"→"09:00", "10"→"10:00",
                    # "09:"→"09:00", "9HS"→"09:00"
                    t = apertura_time.strip()
                    t = re.sub(r"[hHsS]+$", "", t).strip()  # strip HS suffix
                    t = t.replace(";", ":").replace(".", ":")
                    t = t.rstrip(":")  # trailing colon
                    if re.match(r"^\d{1,2}$", t):
                        t = f"{t}:00"
                    elif re.match(r"^\d{3,4}$", t):
                        # "1000" → "10:00", "900" → "9:00"
                        t = f"{t[:-2]}:{t[-2:]}"
                    date_str = f"{apertura_date} {t}"
                opening_date_parsed = parse_date_guess(date_str)

            # VIGENCIA MODEL: Resolve dates with multi-source fallback
            # ComprasApps grid has no real publication date, but title has year "3/2026-616"
            publication_date = self._resolve_publication_date(
                parsed_date=None,  # No pub date in grid
                title=titulo,  # Extract year from "3/2026-616" format
                description=titulo,
                opening_date=opening_date_parsed,
                attached_files=[]
            )

            opening_date = self._resolve_opening_date(
                parsed_date=opening_date_parsed,
                title=titulo,
                description=titulo,
                publication_date=publication_date,
                attached_files=[]
            )

            # Status mapping
            status = "active"
            if estado:
                e_lower = estado.lower()
                if "adjudic" in e_lower:
                    status = "awarded"
                elif "sin efecto" in e_lower or "desiert" in e_lower:
                    status = "cancelled"
                elif "proceso" in e_lower or "tramit" in e_lower:
                    status = "active"

            # Content hash for deduplication
            content_hash = hashlib.md5(
                f"{titulo.lower().strip()}|{organization}|{numero}".encode()
            ).hexdigest()

            # Extract CUC from process number if not in column
            # Format: "3/2026-616" → CUC 616
            if not cuc_code:
                m = re.search(r"-(\d{3})$", numero)
                if m:
                    cuc_code = m.group(1)

            # Build metadata
            metadata = {
                "comprasapps_numero": numero,
                "comprasapps_tipo": tipo,
                "comprasapps_estado": estado,
                "comprasapps_cuc": cuc_code,
                "comprasapps_org": org_name,
                "comprasapps_apertura_raw": f"{apertura_date} {apertura_time}".strip(),
            }

            # Reconstruct stable detail URL (hli00048 — public, no session)
            anio_raw = col(COL_ANIO)
            seq_raw = col(COL_SEQ)
            tip_code_raw = col(COL_TIPO_CODE)
            cuc_raw = col(COL_CUC)
            stable_detail_url = None
            if anio_raw and seq_raw and tip_code_raw and cuc_raw:
                stable_detail_url = (
                    f"https://comprasapps.mendoza.gov.ar/Compras/servlet/"
                    f"hli00048?{anio_raw},{cuc_raw},{tip_code_raw},{seq_raw}"
                )
                metadata["comprasapps_detail_url"] = stable_detail_url
                metadata["comprasapps_anio"] = anio_raw
                metadata["comprasapps_seq"] = seq_raw
                metadata["comprasapps_tipo_code"] = tip_code_raw

            # Determine jurisdiccion from CUC
            jurisdiccion = "Mendoza"
            if cuc_code and cuc_code in CUC_NAMES:
                name = CUC_NAMES[cuc_code]
                if "Municipalidad de" in name:
                    jurisdiccion = name.replace("Municipalidad de ", "")

            # Compute estado
            estado_vigencia = self._compute_estado(publication_date, opening_date, fecha_prorroga=None)

            # Merge detail popup data if available
            budget = None
            currency = None
            expedient_number = None
            detail_description = None

            pliegos_bases = []
            if detail_data:
                budget = detail_data.get("budget_parsed")
                currency = detail_data.get("currency") if budget else None
                expedient_number = detail_data.get("expedient_number")
                detail_description = detail_data.get("description")

                # Build pliegos_bases from discovered URLs
                for pliego_url in (detail_data.get("pliego_urls") or []):
                    fname = pliego_url.rsplit("/", 1)[-1]
                    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
                    pliegos_bases.append({
                        "url": pliego_url,
                        "titulo": f"Pliego/Adjuntos — {fname}",
                        "tipo": "ZIP" if ext == "zip" else "PDF",
                        "fuente": "comprasapps",
                    })

                # Store detail fields in metadata
                metadata["detail_popup"] = {
                    k: v for k, v in detail_data.items()
                    if k not in ("budget_parsed", "pliego_urls")
                }

            # Extract objeto — avoid duplicating the title verbatim
            from utils.object_extractor import extract_objeto
            desc_for_obj = detail_description or titulo
            objeto_raw = extract_objeto(titulo, desc_for_obj[:1000], None)
            # If extract_objeto returned the full title unchanged (common in ComprasApps
            # where title IS the description), clean it: strip legal prefixes and
            # deduplicate repeated sentences.
            if objeto_raw and titulo:
                # Remove common title prefixes that pollute the objeto
                cleaned = re.sub(
                    r'^(?:S/ADQ\.\s+DE\s+|OBJETO:\s*|ADQUISICI[OÓ]N\s+DE\s+|'
                    r'CONTRATACI[OÓ]N\s+(?:DIRECTA\s+)?(?:DE\s+)?)',
                    '', objeto_raw, flags=re.I
                ).strip()
                # Deduplicate: if the string is literally doubled ("X X" where X==X)
                half = len(cleaned) // 2
                if half > 10 and cleaned[:half].strip() == cleaned[half:].strip():
                    cleaned = cleaned[:half].strip()
                objeto = cleaned if len(cleaned) >= 5 else objeto_raw
            else:
                objeto = objeto_raw

            return LicitacionCreate(
                title=titulo,
                organization=organization,
                publication_date=publication_date,
                opening_date=opening_date,
                licitacion_number=numero,
                description=detail_description or titulo,
                budget=budget,
                currency=currency,
                expedient_number=expedient_number,
                objeto=objeto,
                source_url=stable_detail_url or self.BASE_URL,
                canonical_url=stable_detail_url or self.BASE_URL,
                source_urls={
                    "comprasapps_list": self.BASE_URL,
                    **({"comprasapps_detail": stable_detail_url} if stable_detail_url else {}),
                },
                url_quality="direct" if stable_detail_url else "list_only",
                content_hash=content_hash,
                status=status,
                location="Mendoza",
                attached_files=[],
                pliegos_bases=pliegos_bases,
                id_licitacion=numero,
                jurisdiccion=jurisdiccion,
                tipo_procedimiento=tipo,
                tipo_acceso="ComprasApps",
                fecha_scraping=utc_now(),
                fuente="ComprasApps Mendoza",
                metadata=metadata,
                estado=estado_vigencia,
                fecha_prorroga=None,
            )
        except Exception as e:
            logger.error(f"Error converting row to licitacion: {e}")
            return None

    async def run(self) -> List[LicitacionCreate]:
        """Execute the scraper: fetch all licitaciones from all CUCs."""
        await self.setup()
        try:
            # Initialize session
            if not await self._init_session():
                logger.error("Failed to initialize session - "
                           "site may be inaccessible from this network")
                return []

            selectors = self.config.selectors or {}
            current_year = datetime.now().year
            years_to_search = selectors.get("years", [current_year, current_year - 1, current_year - 2])
            # GeneXus estado filters:
            #   "V" = Vigente only, "P" = En Proceso only, "A" = Adjudicada only
            #   "" (empty) returns Vigente on page 1 but BREAKS pagination (always returns page 1)
            #   "T" only returns En Proceso (NOT "Todas" despite the name)
            # MUST use explicit filters ["V", "P"] for working pagination.
            estado_filters = selectors.get("estado_filters", ["V", "P"])
            cuc = str(selectors.get("cuc_filter", "0"))   # 0=all CUCs
            max_pages = int(selectors.get("max_pages", 100))

            # Store for pagination
            self._search_cuc = cuc

            all_rows: List[List[Any]] = []
            seen_numeros = set()  # Dedup across searches

            for anio in years_to_search:
                anio = int(anio)
                for estado in estado_filters:
                    self._search_anio = anio
                    self._search_estado = estado
                    estado_label = estado or "(Vigente/empty)"
                    logger.info(f"Searching year {anio}, estado={estado_label}, cuc={cuc}")

                    # Per-year/estado timeout: prevent one slow search from blocking entire run
                    async def _do_search():
                        # Re-initialize session for each search to get fresh GXState
                        if not await self._init_session():
                            logger.warning(f"Session init failed for {anio}/{estado_label}")
                            return []

                        form_data = self._build_search_form(
                            anio=anio, estado=estado, cuc=cuc)
                        search_html = await self._post_search(form_data)
                        if not search_html:
                            logger.warning(f"Search failed for {anio}/{estado_label}")
                            return []

                        page = 1
                        search_rows_count = 0
                        consecutive_stale = 0
                        MAX_STALE_PAGES = 3
                        found_rows = []

                        while True:
                            rows = self._extract_grid_data(search_html)
                            if not rows:
                                break

                            new_rows = []
                            for row in rows:
                                num = str(row[0]).strip() if len(row) > 0 else ""
                                if num and num not in seen_numeros:
                                    seen_numeros.add(num)
                                    new_rows.append(row)

                            found_rows.extend(new_rows)
                            search_rows_count += len(new_rows)
                            logger.info(f"  {anio}/{estado_label} p{page}: "
                                       f"{len(rows)} rows ({len(new_rows)} new, "
                                       f"total: {len(all_rows) + len(found_rows)})")

                            if len(new_rows) == 0:
                                consecutive_stale += 1
                                if consecutive_stale >= MAX_STALE_PAGES:
                                    logger.warning(f"  Stopping: {MAX_STALE_PAGES} "
                                                 f"consecutive pages with 0 new rows")
                                    break
                            else:
                                consecutive_stale = 0

                            if len(rows) < ROWS_PER_PAGE or page >= max_pages:
                                break

                            page += 1
                            page_offset = (page - 1) * ROWS_PER_PAGE
                            await asyncio.sleep(self.config.wait_time)

                            page_form = self._build_page_form(page_offset)
                            search_html = await self._post_search(page_form)
                            if not search_html:
                                break

                        logger.info(f"  {anio}/{estado_label}: {search_rows_count} unique rows")
                        return found_rows

                    try:
                        year_rows = await asyncio.wait_for(_do_search(), timeout=90)
                        all_rows.extend(year_rows)
                    except asyncio.TimeoutError:
                        logger.warning(f"Timeout (90s) searching year {anio}, estado={estado_label} — skipping")
                    except Exception as e:
                        logger.warning(f"Error searching year {anio}, estado={estado_label}: {e}")

            logger.info(f"Total rows extracted: {len(all_rows)}")

            # Fetch detail page (hli00048) for vigente rows to get budget, expediente, etc.
            fetch_details = selectors.get("fetch_details", True)
            detail_cache: Dict[str, Dict[str, Any]] = {}

            if fetch_details and all_rows:
                vigente_rows = [r for r in all_rows
                                if len(r) > COL_ESTADO
                                and str(r[COL_ESTADO]).strip().lower() in ("vigente", "en proceso")]

                logger.info(f"Fetching detail (hli00048) for {len(vigente_rows)} vigente rows...")
                fetched = 0
                errors = 0

                for i, row in enumerate(vigente_rows):
                    num = str(row[COL_NUMERO]).strip() if len(row) > COL_NUMERO else ""
                    if not num:
                        continue
                    try:
                        detail = await self._fetch_detail(row)
                        if detail:
                            detail_cache[num] = detail
                            if detail.get("budget_parsed"):
                                fetched += 1
                    except Exception as e:
                        errors += 1
                        if errors < 5:
                            logger.warning(f"Detail fetch error for {num}: {e}")

                    await asyncio.sleep(0.5)

                    if (i + 1) % 25 == 0:
                        logger.info(f"  Detail progress: {i+1}/{len(vigente_rows)} "
                                   f"({fetched} with budget, {errors} errors)")

                logger.info(f"Detail fetch complete: {fetched}/{len(vigente_rows)} "
                           f"with budget ({errors} errors)")

            # Convert rows to licitaciones
            licitaciones: List[LicitacionCreate] = []
            seen_ids = set()

            for row in all_rows:
                num = str(row[COL_NUMERO]).strip() if len(row) > COL_NUMERO else ""
                lic = self._row_to_licitacion(row, detail_data=detail_cache.get(num))
                if not lic:
                    continue

                if lic.id_licitacion in seen_ids:
                    continue
                seen_ids.add(lic.id_licitacion)

                licitaciones.append(lic)

                if self.config.max_items and len(licitaciones) >= self.config.max_items:
                    break

            # Sort by publication date (newest first); handle None gracefully
            licitaciones.sort(
                key=lambda l: l.publication_date or datetime.min, reverse=True
            )

            # Log CUC distribution
            cuc_counts: Dict[str, int] = {}
            for lic in licitaciones:
                cuc_key = lic.metadata.get("comprasapps_cuc", "unknown") if lic.metadata else "unknown"
                cuc_counts[cuc_key] = cuc_counts.get(cuc_key, 0) + 1

            logger.info(f"Scraper complete. Total: {len(licitaciones)}, "
                       f"CUC distribution: {dict(sorted(cuc_counts.items(), key=lambda x: -x[1]))}")

            return licitaciones

        except Exception as e:
            logger.error(f"Scraper failed: {e}", exc_info=True)
            raise  # Let scheduler handle failure tracking + retry + alert
        finally:
            await self.cleanup()

    async def extract_licitacion_data(self, html: str, url: str) -> Optional[LicitacionCreate]:
        """Not used - this scraper overrides run() directly."""
        return None

    async def extract_links(self, html: str) -> List[str]:
        """Not used - this scraper overrides run() directly."""
        return []

    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        """Not used - pagination handled in run()."""
        return None
