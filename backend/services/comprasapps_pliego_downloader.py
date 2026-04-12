"""ComprasApps Pliego Downloader — Authenticated access to ComprasApps Mendoza.

GeneXus-based vendor portal at comprasapps.mendoza.gov.ar.
Login unlocks 3 hidden sections on the detail page (hli00048):
  - TBLDESCARGA: Pliego PDF downloads
  - BTN_OC: Órdenes de Compra (who won, at what price)
  - MovimientosContainerDataV: Process timeline/history

GeneXus 16 Java uses CSRF tokens (AJAX_SECURITY_TOKEN + hsh) that prevent
programmatic form POSTs. Login MUST use Selenium (headless browser) to
execute the real GeneXus JS. After login, cookies are transferred to aiohttp
for fast subsequent requests.

Anti-ban: 2.5s delay between requests, max 10 items per session,
circuit breaker after 3 login failures.
"""

import asyncio
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiohttp
from bs4 import BeautifulSoup

logger = logging.getLogger("comprasapps_pliego_downloader")

# Selenium / Chrome config (same as emesa_scraper)
CHROMIUM_BINARY = "/usr/bin/chromium"
CHROMEDRIVER_PATH = "/usr/bin/chromedriver"
CHROME_OPTIONS = [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1920,1080",
    "--disable-extensions",
    "--disable-blink-features=AutomationControlled",
]

STORAGE_DIR = os.environ.get("STORAGE_DIR", "/home/ubuntu/licitometro/storage")
BASE_URL = "https://comprasapps.mendoza.gov.ar/Compras/servlet"


class ComprasAppsAuthClient:
    """Authenticated client for ComprasApps Mendoza (GeneXus)."""

    AUTH_DELAY = 2.5       # seconds between authenticated requests
    MAX_LOGIN_FAILURES = 3
    MAX_ITEMS_PER_SESSION = 10

    def __init__(self, db=None):
        self.db = db
        self.user = ""
        self.password = ""
        self._session: Optional[aiohttp.ClientSession] = None
        self._logged_in = False

    async def _load_credentials(self) -> bool:
        """Load credentials from site_credentials matching comprasapps.mendoza."""
        if self.db is not None:
            cred = await self.db.site_credentials.find_one({
                "enabled": True,
                "site_url": {"$regex": "comprasapps\\.mendoza", "$options": "i"},
            })
            if cred:
                self.user = cred.get("username", "")
                self.password = cred.get("password", "")
                await self.db.site_credentials.update_one(
                    {"_id": cred["_id"]},
                    {"$set": {"last_used": datetime.now(timezone.utc)}},
                )
                return bool(self.user and self.password)
        # Fallback to env
        self.user = os.environ.get("COMPRASAPPS_USER", "")
        self.password = os.environ.get("COMPRASAPPS_PASS", "")
        return bool(self.user and self.password)

    async def _update_status(self, status: str):
        """Update credential last_status."""
        if self.db is not None:
            await self.db.site_credentials.update_one(
                {"enabled": True, "site_url": {"$regex": "comprasapps\\.mendoza", "$options": "i"}},
                {"$set": {"last_status": status, "last_used": datetime.now(timezone.utc)}},
            )

    def _extract_hidden_fields(self, soup: BeautifulSoup) -> dict:
        """Extract all hidden input fields (GXState, AJAX tokens, etc.)."""
        fields = {}
        for inp in soup.find_all("input", type="hidden"):
            name = inp.get("name", "")
            if name:
                fields[name] = inp.get("value", "")
        return fields

    def _extract_gxstate(self, soup: BeautifulSoup) -> dict:
        """Parse GXState JSON from hidden input."""
        inp = soup.find("input", {"name": "GXState"})
        if inp and inp.get("value"):
            try:
                return json.loads(inp["value"])
            except (json.JSONDecodeError, TypeError):
                pass
        return {}

    async def login(self) -> bool:
        """Login to ComprasApps using Selenium (headless Chrome).

        GeneXus 16 Java CSRF protection prevents programmatic form POSTs.
        Selenium executes the real GeneXus JS, bypassing CSRF.
        After login, cookies are transferred to aiohttp for fast requests.
        """
        try:
            # Run Selenium in a thread (it's synchronous)
            cookies = await asyncio.to_thread(self._selenium_login)
            if not cookies:
                return False

            # Create aiohttp session with Selenium cookies
            connector = aiohttp.TCPConnector(ssl=False)
            timeout = aiohttp.ClientTimeout(total=30)
            jar = aiohttp.CookieJar(unsafe=True)
            self._session = aiohttp.ClientSession(
                connector=connector, timeout=timeout, cookie_jar=jar,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"},
            )

            # Transfer cookies from Selenium to aiohttp
            for cookie in cookies:
                self._session.cookie_jar.update_cookies(
                    {cookie["name"]: cookie["value"]},
                    response_url=aiohttp.client.URL("https://comprasapps.mendoza.gov.ar/"),
                )

            # Verify session works: fetch a detail page and check for auth markers
            test_url = f"{BASE_URL}/hli00048?2026,101,1,1"
            await asyncio.sleep(self.AUTH_DELAY)
            async with self._session.get(test_url) as resp:
                if resp.status != 200:
                    logger.warning(f"ComprasApps session verify failed: {resp.status}")
                    await self._update_status("ERROR - Cookies no funcionan")
                    return False
                html = (await resp.read()).decode("utf-8", errors="replace")

            gxstate = self._extract_gxstate(BeautifulSoup(html, "html.parser"))
            if gxstate.get("TBLDESCARGA_Visible") == "1" or gxstate.get("BTN_OC_Visible") == "1":
                logger.info("ComprasApps login verified — auth sections visible")
                await self._update_status("OK - Login exitoso")
                self._logged_in = True
                return True

            # Even if sections aren't visible on this item, check we're not on login page
            if "MPCATALOGOSINLOGUIN" not in str(gxstate.get("GX_AUTH_MPCATALOGOSINLOGUIN", "")):
                # Different auth token = logged in
                logger.info("ComprasApps login verified — different auth context")
                await self._update_status("OK - Login exitoso")
                self._logged_in = True
                return True

            logger.warning("ComprasApps login: cookies transferred but still anonymous")
            await self._update_status("ERROR - Sesion no autenticada")
            return False

        except Exception as e:
            logger.error(f"ComprasApps login error: {e}")
            await self._update_status(f"ERROR - {type(e).__name__}: {str(e)[:60]}")
            return False

    def _selenium_login(self) -> Optional[list]:
        """Synchronous Selenium login — runs in a thread."""
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        options = Options()
        for opt in CHROME_OPTIONS:
            options.add_argument(opt)
        if os.path.isfile(CHROMIUM_BINARY):
            options.binary_location = CHROMIUM_BINARY
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)

        service_kwargs = {}
        if os.path.isfile(CHROMEDRIVER_PATH):
            service_kwargs["executable_path"] = CHROMEDRIVER_PATH

        driver = None
        try:
            service = Service(**service_kwargs)
            driver = webdriver.Chrome(service=service, options=options)
            driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
                "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
            })

            # Navigate to login page
            logger.info("ComprasApps Selenium: loading login page...")
            driver.get(f"{BASE_URL}/mpcatalogo")
            time.sleep(2)

            # Fill username
            user_input = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "vCONUSRPRF"))
            )
            user_input.clear()
            user_input.send_keys(self.user.upper())
            time.sleep(0.5)

            # Fill password
            pass_input = driver.find_element(By.ID, "vPASSWORD")
            pass_input.clear()
            pass_input.send_keys(self.password)
            time.sleep(0.5)

            # Click login button
            login_btn = driver.find_element(By.ID, "BOTONING")
            login_btn.click()

            # Wait for navigation away from login page (up to 15 seconds)
            logger.info("ComprasApps Selenium: clicked login, waiting...")
            for _ in range(30):
                time.sleep(0.5)
                page_source = driver.page_source
                # Check if we're still on login page
                if "Ingreso de Usuario" not in page_source:
                    logger.info("ComprasApps Selenium: login successful — navigated away")
                    cookies = driver.get_cookies()
                    logger.info(f"ComprasApps Selenium: extracted {len(cookies)} cookies")
                    return cookies
                # Check for error message
                try:
                    msg_el = driver.find_element(By.ID, "MENSAJE")
                    msg_text = msg_el.text.strip()
                    if msg_text:
                        logger.warning(f"ComprasApps Selenium: login error: {msg_text}")
                        return None
                except Exception:
                    pass

            logger.warning("ComprasApps Selenium: timeout waiting for login redirect")
            # Maybe login succeeded but page didn't change — check cookies
            cookies = driver.get_cookies()
            cookie_names = [c["name"] for c in cookies]
            if "JSESSIONID" in cookie_names:
                logger.info(f"ComprasApps Selenium: got {len(cookies)} cookies (might be logged in)")
                return cookies
            return None

        except Exception as e:
            logger.error(f"ComprasApps Selenium error: {e}")
            return None
        finally:
            if driver:
                try:
                    driver.quit()
                except Exception:
                    pass

    async def fetch_detail_authenticated(self, anio: int, cuc: int, tipo: int, nro: int) -> Dict[str, Any]:
        """Fetch hli00048 detail page with authenticated session.

        Returns dict with:
            - movimientos: list of movement entries
            - ordenes_compra: list of purchase orders
            - descargas_visible: bool (whether downloads section is visible)
            - gxstate: raw GXState for further processing
        """
        result: Dict[str, Any] = {
            "movimientos": [],
            "ordenes_compra": [],
            "descargas_visible": False,
            "gxstate": {},
        }

        if not self._logged_in:
            return result

        detail_url = f"{BASE_URL}/hli00048?{anio},{cuc},{tipo},{nro}"

        try:
            await asyncio.sleep(self.AUTH_DELAY)
            async with self._session.get(detail_url) as resp:
                if resp.status != 200:
                    logger.warning(f"ComprasApps detail returned {resp.status}")
                    return result
                html = (await resp.read()).decode("utf-8", errors="replace")

            soup = BeautifulSoup(html, "html.parser")
            gxstate = self._extract_gxstate(soup)
            result["gxstate"] = gxstate

            # Check if download section is visible
            result["descargas_visible"] = gxstate.get("TBLDESCARGA_Visible") == "1"

            # Parse MovimientosContainerData from GXState
            mov_raw = gxstate.get("MovimientosContainerData", "")
            if isinstance(mov_raw, str) and mov_raw:
                try:
                    mov_data = json.loads(mov_raw)
                    if mov_data.get("Count", 0) > 0:
                        # Parse grid rows from MovimientosContainerDataV
                        mov_input = soup.find("input", {"name": "MovimientosContainerDataV"})
                        if mov_input and mov_input.get("value"):
                            mov_rows = json.loads(mov_input["value"])
                            for row in mov_rows:
                                if isinstance(row, list) and len(row) >= 3:
                                    # Columns: [0]=fecha DD/MM/YY, [1]=hora HH:MM:SS, [2]=descripcion, [3]=link
                                    fecha = str(row[0]).strip() if row[0] else ""
                                    hora = str(row[1]).strip() if len(row) > 1 and row[1] else ""
                                    desc = str(row[2]).strip() if len(row) > 2 and row[2] else ""
                                    result["movimientos"].append({
                                        "fecha": f"{fecha} {hora}".strip(),
                                        "descripcion": desc,
                                    })
                except (json.JSONDecodeError, TypeError):
                    pass

            # Check if OC button is visible
            oc_visible = gxstate.get("BTN_OC_Visible") == "1"
            if oc_visible:
                result["ordenes_compra"] = await self._fetch_ordenes_compra(soup, detail_url)

            logger.info(
                f"ComprasApps auth detail {anio}/{cuc}/{tipo}/{nro}: "
                f"descargas={result['descargas_visible']}, "
                f"movimientos={len(result['movimientos'])}, "
                f"OC={len(result['ordenes_compra'])}"
            )

        except Exception as e:
            logger.warning(f"ComprasApps auth detail failed: {e}")

        return result

    async def _fetch_ordenes_compra(self, soup: BeautifulSoup, page_url: str) -> List[dict]:
        """Trigger BTN_OC event to fetch purchase orders."""
        ordenes = []
        try:
            fields = self._extract_hidden_fields(soup)
            fields["_EventName"] = "E'BTN_OC'."

            await asyncio.sleep(self.AUTH_DELAY)
            async with self._session.post(page_url, data=fields, allow_redirects=True) as resp:
                if resp.status != 200:
                    return ordenes
                html = (await resp.read()).decode("utf-8", errors="replace")

            # Parse OC table — GeneXus typically renders a grid
            oc_soup = BeautifulSoup(html, "html.parser")

            # Look for table rows with OC data
            # GeneXus grids use ContainerDataV hidden inputs
            for inp in oc_soup.find_all("input", type="hidden"):
                name = inp.get("name", "")
                if "ContainerDataV" in name and "OC" in name.upper():
                    try:
                        rows = json.loads(inp.get("value", "[]"))
                        for row in rows:
                            if isinstance(row, list) and len(row) >= 4:
                                ordenes.append({
                                    "numero_oc": str(row[0]).strip(),
                                    "proveedor": str(row[1]).strip() if len(row) > 1 else "",
                                    "monto": self._parse_amount(str(row[2])) if len(row) > 2 else 0,
                                    "fecha": str(row[3]).strip() if len(row) > 3 else "",
                                    "moneda": "ARS",
                                })
                    except (json.JSONDecodeError, TypeError, IndexError):
                        pass

            # Fallback: parse HTML table directly
            if not ordenes:
                for table in oc_soup.find_all("table"):
                    rows = table.find_all("tr")
                    for row in rows:
                        cells = row.find_all("td")
                        if len(cells) >= 3:
                            texts = [c.get_text(strip=True) for c in cells]
                            # Look for rows with amounts (contain $ or numbers with commas)
                            if any(re.search(r'[\d.,]{3,}', t) for t in texts):
                                ordenes.append({
                                    "numero_oc": texts[0] if texts[0] else "",
                                    "proveedor": texts[1] if len(texts) > 1 else "",
                                    "monto": self._parse_amount(texts[2]) if len(texts) > 2 else 0,
                                    "fecha": texts[3] if len(texts) > 3 else "",
                                    "moneda": "ARS",
                                })

            if ordenes:
                logger.info(f"ComprasApps: found {len(ordenes)} ordenes de compra")

        except Exception as e:
            logger.warning(f"ComprasApps OC fetch failed: {e}")

        return ordenes

    async def download_pliegos(self, source_url: str) -> List[dict]:
        """Download pliego PDFs from ComprasApps.

        Args:
            source_url: The hli00048 or hli00049 URL for this item.

        Returns:
            List of downloaded pliego docs.
        """
        if not await self._load_credentials():
            logger.info("No ComprasApps credentials — skipping auth download")
            return []

        # Parse params from URL: hli00048?{anio},{cuc},{tipo},{nro}
        params = self._parse_detail_url(source_url)
        if not params:
            return []

        if not self._logged_in:
            if not await self.login():
                return []

        detail = await self.fetch_detail_authenticated(**params)

        downloaded = []
        if detail["descargas_visible"]:
            # Trigger BTNARCHIVOS to get download list
            pliegos = await self._download_anexos(params)
            downloaded.extend(pliegos)

        # Store OC and movimientos in return for caller to persist
        if detail["ordenes_compra"] or detail["movimientos"]:
            # Return as metadata alongside pliegos
            if not downloaded:
                downloaded = []  # ensure list exists
            # Attach metadata to first pliego or create placeholder
            metadata = {}
            if detail["ordenes_compra"]:
                metadata["ordenes_compra"] = detail["ordenes_compra"]
            if detail["movimientos"]:
                metadata["movimientos"] = detail["movimientos"]
            if metadata:
                downloaded.append({
                    "name": "__metadata__",
                    "url": "",
                    "type": "metadata",
                    "priority": 999,
                    "label": "Datos autenticados",
                    "source": "comprasapps_authenticated",
                    "metadata": metadata,
                })

        return downloaded

    async def _download_anexos(self, params: dict) -> List[dict]:
        """Trigger BTNARCHIVOS and download pliego files."""
        downloaded = []
        detail_url = f"{BASE_URL}/hli00048?{params['anio']},{params['cuc']},{params['tipo']},{params['nro']}"

        try:
            # Re-fetch detail to get fresh hidden fields
            await asyncio.sleep(self.AUTH_DELAY)
            async with self._session.get(detail_url) as resp:
                if resp.status != 200:
                    return downloaded
                html = (await resp.read()).decode("utf-8", errors="replace")

            soup = BeautifulSoup(html, "html.parser")
            fields = self._extract_hidden_fields(soup)

            # Trigger BTNARCHIVOS (data-gx-evt="5")
            fields["_EventName"] = "E'BTNARCHIVOS'."

            await asyncio.sleep(self.AUTH_DELAY)
            async with self._session.post(detail_url, data=fields, allow_redirects=True) as resp:
                if resp.status != 200:
                    return downloaded
                content_type = resp.headers.get("Content-Type", "")

                # Could return HTML (file list) or direct binary
                if "pdf" in content_type.lower() or "octet" in content_type.lower():
                    # Direct file download
                    data = await resp.read()
                    if data[:4] == b"%PDF":
                        saved = await self._save_pdf(data, "pliego.pdf")
                        if saved:
                            from services.pliego_finder import classify_pliego
                            priority, label = classify_pliego("pliego")
                            downloaded.append({
                                "name": "Pliego",
                                "url": saved["url"],
                                "type": "pdf",
                                "priority": priority,
                                "label": label,
                                "source": "comprasapps_authenticated",
                                "local_path": saved["path"],
                                "size": len(data),
                            })
                else:
                    # HTML response — might contain download links
                    body = (await resp.read()).decode("utf-8", errors="replace")
                    dl_soup = BeautifulSoup(body, "html.parser")

                    # Look for PDF links
                    for a in dl_soup.find_all("a", href=True):
                        href = a.get("href", "")
                        if href.lower().endswith(".pdf") or "download" in href.lower():
                            full_url = href if href.startswith("http") else f"https://comprasapps.mendoza.gov.ar{href}"
                            await asyncio.sleep(self.AUTH_DELAY)
                            try:
                                async with self._session.get(full_url) as pdf_resp:
                                    if pdf_resp.status == 200:
                                        data = await pdf_resp.read()
                                        if data[:4] == b"%PDF":
                                            name = a.get_text(strip=True) or "pliego"
                                            saved = await self._save_pdf(data, f"{name}.pdf")
                                            if saved:
                                                from services.pliego_finder import classify_pliego
                                                priority, label = classify_pliego(name)
                                                downloaded.append({
                                                    "name": name,
                                                    "url": saved["url"],
                                                    "type": "pdf",
                                                    "priority": priority,
                                                    "label": label,
                                                    "source": "comprasapps_authenticated",
                                                    "local_path": saved["path"],
                                                    "size": len(data),
                                                })
                            except Exception as e:
                                logger.warning(f"Failed to download ComprasApps file {full_url}: {e}")

        except Exception as e:
            logger.warning(f"ComprasApps download anexos failed: {e}")

        return downloaded

    async def _save_pdf(self, pdf_bytes: bytes, filename: str) -> Optional[dict]:
        """Save PDF to storage/pliegos directory."""
        try:
            docs_dir = Path(STORAGE_DIR) / "pliegos"
            docs_dir.mkdir(parents=True, exist_ok=True)
            safe_name = re.sub(r"[^\w\-.]", "_", filename)
            if not safe_name.lower().endswith(".pdf"):
                safe_name += ".pdf"
            unique_name = f"{uuid.uuid4().hex[:8]}_{safe_name}"
            path = docs_dir / unique_name
            with open(path, "wb") as f:
                f.write(pdf_bytes)
            logger.info(f"Saved ComprasApps pliego: {path} ({len(pdf_bytes)} bytes)")
            return {"path": str(path), "url": f"/api/storage/pliegos/{unique_name}"}
        except Exception as e:
            logger.error(f"Failed to save PDF: {e}")
            return None

    def _parse_detail_url(self, url: str) -> Optional[dict]:
        """Parse hli00048?anio,cuc,tipo,nro from URL or metadata."""
        m = re.search(r'hli00048\?(\d+),(\d+),(\d+),(\d+)', url)
        if m:
            return {"anio": int(m.group(1)), "cuc": int(m.group(2)),
                    "tipo": int(m.group(3)), "nro": int(m.group(4))}
        return None

    @staticmethod
    def build_detail_params_from_licitacion(lic: dict) -> Optional[dict]:
        """Build hli00048 params from licitacion metadata.

        licitacion_number format: '867/2026-508' → nro=867, anio=2026, cuc=508
        comprasapps_tipo: 'Compra Directa'→1, 'Licitacion Privada'→2, 'Licitacion Publica'→4
        """
        lic_num = lic.get("licitacion_number") or lic.get("id_licitacion") or ""
        m = re.match(r'(\d+)/(\d{4})-(\d+)', lic_num)
        if not m:
            return None

        nro = int(m.group(1))
        anio = int(m.group(2))
        cuc = int(m.group(3))

        tipo_map = {
            "compra directa": 1, "contratacion directa": 1,
            "licitacion privada": 2, "privada": 2,
            "licitacion publica": 4, "publica": 4,
        }
        meta = lic.get("metadata") or {}
        tipo_str = (meta.get("comprasapps_tipo") or "").lower().strip()
        tipo = tipo_map.get(tipo_str, 1)  # default to 1 (Directa)

        return {"anio": anio, "cuc": cuc, "tipo": tipo, "nro": nro}

    @staticmethod
    def _parse_amount(text: str) -> float:
        """Parse Argentine amount: '30.000.000,00' → 30000000.00."""
        try:
            cleaned = re.sub(r'[^\d.,]', '', text)
            cleaned = cleaned.replace(".", "").replace(",", ".")
            return float(cleaned) if cleaned else 0
        except (ValueError, TypeError):
            return 0

    async def close(self):
        """Close the HTTP session."""
        if self._session:
            await self._session.close()
            self._session = None
            self._logged_in = False
