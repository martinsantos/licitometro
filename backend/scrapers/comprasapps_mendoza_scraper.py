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
            # Route through Cloudflare proxy if domain is blocked
            target_url = self.BASE_URL
            extra_headers = {}
            use_proxy = self._needs_proxy(self.BASE_URL)
            if use_proxy:
                from scrapers.resilient_http import PROXY_URL, PROXY_SECRET
                extra_headers = {"X-Target-URL": self.BASE_URL, "X-Proxy-Secret": PROXY_SECRET}
                target_url = PROXY_URL
                logger.info("ComprasApps: using Cloudflare proxy")

            # Retry up to 3 times (proxy may return 522 on first attempt)
            html = None
            proxy_timeout = aiohttp.ClientTimeout(total=30, connect=10, sock_read=25)
            for attempt in range(3):
                try:
                    async with self.session.get(
                        target_url,
                        ssl=(use_proxy or None),  # True for proxy, None (default) for direct
                        timeout=proxy_timeout if use_proxy else self._REQUEST_TIMEOUT,
                        headers=extra_headers,
                    ) as resp:
                        if resp.status == 522 and attempt < 2:
                            logger.warning(f"Proxy returned 522, retry {attempt + 1}")
                            await asyncio.sleep(1)
                            continue
                        if resp.status >= 400:
                            logger.error(f"Init failed: HTTP {resp.status}")
                            return False
                        raw = await resp.read()
                        html = raw.decode("utf-8", errors="replace")
                        break
                except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                    if attempt < 2:
                        logger.warning(f"Init attempt {attempt + 1} failed: {e}, retrying...")
                        await asyncio.sleep(1)
                        continue
                    raise

            if not html:
                logger.error("Init failed: no response after retries")
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
            target_url = self.BASE_URL
            post_headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": self.BASE_URL,
            }
            use_proxy = self._needs_proxy(self.BASE_URL)
            if use_proxy:
                from scrapers.resilient_http import PROXY_URL, PROXY_SECRET
                post_headers["X-Target-URL"] = self.BASE_URL
                post_headers["X-Proxy-Secret"] = PROXY_SECRET
                target_url = PROXY_URL

            proxy_timeout = aiohttp.ClientTimeout(total=30, connect=10, sock_read=25)
            resp_status = None
            html = None
            for attempt in range(3):
                try:
                    async with self.session.post(
                        target_url,
                        data=form_data,
                        headers=post_headers,
                        ssl=(use_proxy or None),
                        timeout=proxy_timeout if use_proxy else self._REQUEST_TIMEOUT,
                    ) as resp:
                        resp_status = resp.status
                        if resp.status == 522 and attempt < 2:
                            logger.warning(f"Proxy POST returned 522, retry {attempt + 1}")
                            await asyncio.sleep(1)
                            continue
                        if resp.status >= 400:
                            logger.error(f"POST failed: HTTP {resp.status}")
                            return None
                        raw = await resp.read()
                        html = raw.decode("utf-8", errors="replace")

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
                except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                    if attempt < 2:
                        logger.warning(f"POST attempt {attempt + 1} failed: {e}, retrying...")
                        await asyncio.sleep(1)
                        continue
                    raise
            return html
        except Exception as e:
            logger.error(f"POST search failed: {e}")
            return None

    async def _fetch_detail(self, row: List[Any]) -> Optional[Dict[str, Any]]:
        """Fetch detail popup for a grid row via GeneXus 'VER' event.

        Returns dict with parsed fields (budget_parsed, currency, expedient_number,
        description, norma_legal, etc.) or None on failure.
        """
        try:
            anio = str(row[COL_ANIO]) if len(row) > COL_ANIO else ""
            nro = str(row[COL_SEQ]) if len(row) > COL_SEQ else ""
            tip_num = str(row[COL_TIPO_CODE]) if len(row) > COL_TIPO_CODE else ""
            cuc_num = str(row[COL_CUC]) if len(row) > COL_CUC else ""

            if not anio or not nro:
                return None

            form = {
                "_EventName": "'VER'",
                "_EventGridId": "97",
                "_EventRowId": "",
                "LIEJER": anio,
                "LINRO": nro,
                "LITIP": tip_num,
                "LICUC": cuc_num,
                "GXState": self._gxstate_raw,
                "vEJER": str(self._search_anio),
                "vLICNRO": "0",
                "vLICUCFIL": "0",
                "vESTFILTRO": self._search_estado,
                "vLICABCONTIPOSEL": "",
                "vRUBRO": "000000",
                "vLICUC": self._search_cuc,
                "vFINANSEL": "",
                "vFCHDESDE": "  /  /  ",
                "vFCHHASTA": "  /  /  ",
            }

            html = await self._post_search(form)
            if not html:
                return None

            return self._parse_detail_html(html)
        except Exception as e:
            logger.debug(f"Detail fetch failed: {e}")
            return None

    def _parse_detail_html(self, html: str) -> Dict[str, Any]:
        """Parse detail popup HTML to extract label-value pairs."""
        soup = BeautifulSoup(html, "html.parser")
        result: Dict[str, Any] = {}

        # The popup renders as table cells: label in one td, value in next td
        cells = soup.find_all("td")

        label_map = {
            "presupuesto oficial": "budget_raw",
            "moneda": "currency_raw",
            "descripci": "description",
            "expediente": "expedient_raw",
            "fecha de apertura": "opening_date_str",
            "hora de apertura": "opening_time_str",
            "repartici": "reparticion_destino",
            "norma legal": "norma_legal",
            "valor del pliego": "valor_pliego",
            "garant": "garantia_oferta",
            "plazo de entrega": "plazo_entrega",
            "lugar de entrega": "lugar_entrega",
            "forma de pago": "forma_pago",
            "organismo licitante": "organismo_licitante",
            "financiamiento": "financiamiento",
        }

        for i, cell in enumerate(cells):
            cell_text = cell.get_text(strip=True)
            cell_lower = cell_text.lower()
            for label_key, field_name in label_map.items():
                if label_key in cell_lower and field_name not in result:
                    # Value is in the next cell(s)
                    for nc in cells[i + 1 : i + 4]:
                        val = nc.get_text(strip=True)
                        if val and val.lower() != cell_lower and len(val) > 0:
                            result[field_name] = val
                            break
                    break

        # Parse budget: "30.000.000,00" → 30000000.00
        if result.get("budget_raw"):
            try:
                raw = result["budget_raw"].replace(".", "").replace(",", ".")
                budget = float(raw)
                if budget > 0:
                    result["budget_parsed"] = budget
            except (ValueError, TypeError):
                pass

        # Parse currency: "PESOS" → "ARS", "DOLARES" → "USD"
        currency_raw = (result.get("currency_raw") or "").upper()
        if "PESO" in currency_raw:
            result["currency"] = "ARS"
        elif "DOLAR" in currency_raw or "USD" in currency_raw:
            result["currency"] = "USD"
        else:
            result["currency"] = "ARS"

        # Parse expediente: "Nro 388815 Letra Año 2026" → "388815/2026"
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
            estado = col(COL_ESTADO, "Vigente")
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

            if detail_data:
                budget = detail_data.get("budget_parsed")
                currency = detail_data.get("currency") if budget else None
                expedient_number = detail_data.get("expedient_number")
                detail_description = detail_data.get("description")
                # Store all detail fields in metadata
                metadata["detail_popup"] = {
                    k: v for k, v in detail_data.items()
                    if k not in ("budget_parsed",)
                }

            # Extract objeto from title or detail description
            from utils.object_extractor import extract_objeto
            desc_for_obj = detail_description or titulo
            objeto = extract_objeto(titulo, desc_for_obj[:1000], None)

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
                source_url=self.BASE_URL,
                canonical_url=self.BASE_URL,
                source_urls={"comprasapps_list": self.BASE_URL},
                url_quality="list_only" if not detail_data else "detail",
                content_hash=content_hash,
                status=status,
                location="Mendoza",
                attached_files=[],
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

            # NOTE: Detail popup requires Selenium (GeneXus CSRF blocks HTTP AJAX).
            # Use scripts/backfill_comprasapps_details.py for budget/expediente extraction.
            detail_cache: Dict[str, Dict[str, Any]] = {}

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
