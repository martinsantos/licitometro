"""COMPR.AR Pliego Downloader — Authenticated download of pliego PDFs.

Domain-agnostic: works with any COMPR.AR instance (Mendoza, Nacional, etc.)
by extracting the base URL from the pliego URL passed to download_anexos().

Credentials loaded from site_credentials (MongoDB) by domain match,
fallback to env vars COMPRAR_USER / COMPRAR_PASS.
"""

import asyncio
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from urllib.parse import urlparse

import aiohttp
from bs4 import BeautifulSoup

logger = logging.getLogger("comprar_pliego_downloader")

STORAGE_DIR = os.environ.get("STORAGE_DIR", "/app/storage")


class ComprarPliegoDownloader:
    """Downloads pliego PDFs from any COMPR.AR site using authenticated session."""

    AUTH_DELAY = 2.5  # seconds between authenticated requests (anti-ban)
    MAX_LOGIN_FAILURES = 3  # circuit breaker

    def __init__(self, db=None):
        self.db = db
        self.user = ""
        self.password = ""
        self.base_url = ""  # e.g. "https://comprar.mendoza.gov.ar"
        self.domain = ""    # e.g. "comprar.mendoza.gov.ar"

    async def _load_credentials(self):
        """Load credentials from site_credentials by domain, fallback to .env."""
        if self.db is not None and self.domain:
            cred = await self.db.site_credentials.find_one({
                "enabled": True,
                "site_url": {"$regex": re.escape(self.domain), "$options": "i"},
            })
            if cred:
                self.user = cred.get("username", "")
                self.password = cred.get("password", "")
                await self.db.site_credentials.update_one(
                    {"_id": cred["_id"]},
                    {"$set": {"last_used": datetime.now(timezone.utc)}},
                )
                return
        # Fallback to env vars
        self.user = os.environ.get("COMPRAR_USER", "")
        self.password = os.environ.get("COMPRAR_PASS", "")

    async def download_anexos(self, pliego_url: str) -> List[dict]:
        """Download all anexos from a VistaPreviaPliego page.

        Args:
            pliego_url: URL to VistaPreviaPliego.aspx or VistaPreviaPliegoCiudadano.aspx
                        on any COMPR.AR domain (Mendoza or Nacional).

        Returns:
            List of downloaded documents: [{name, url, type, priority, label, source, local_path}]
        """
        # Extract domain and base URL from the pliego URL
        parsed = urlparse(pliego_url)
        self.base_url = f"{parsed.scheme}://{parsed.netloc}"
        self.domain = parsed.netloc

        await self._load_credentials()
        if not self.user or not self.password:
            logger.warning(f"No credentials for {self.domain} — configure in Empresa > Credenciales")
            return []

        # Convert VistaPreviaPliegoCiudadano to VistaPreviaPliego (internal view)
        internal_url = pliego_url.replace("VistaPreviaPliegoCiudadano.aspx", "PLIEGO/VistaPreviaPliego.aspx")
        if "PLIEGO/VistaPreviaPliego" not in internal_url:
            qs_match = re.search(r'qs=([^&]+)', pliego_url)
            if qs_match:
                internal_url = f"{self.base_url}/PLIEGO/VistaPreviaPliego.aspx?qs={qs_match.group(1)}"
            else:
                logger.warning(f"Cannot convert to internal pliego URL: {pliego_url}")
                return []

        downloaded = []
        connector = aiohttp.TCPConnector(ssl=False)
        timeout = aiohttp.ClientTimeout(total=60)

        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            try:
                # Step 1: Login
                if not await self._login(session):
                    return []

                # Step 2: Access pliego page
                async with session.get(internal_url) as resp:
                    if resp.status != 200:
                        logger.warning(f"Pliego page returned {resp.status}")
                        return []
                    html = (await resp.read()).decode("utf-8", errors="replace")

                soup = BeautifulSoup(html, "html.parser")

                # Check for error
                error_div = soup.find("div", id=lambda x: x and "Error" in str(x))
                if error_div and error_div.get_text(strip=True):
                    err_text = error_div.get_text(strip=True)
                    if "problema" in err_text.lower():
                        logger.warning(f"Pliego page error: {err_text[:100]}")
                        return []

                # Step 3: Find anexos
                anexos = self._find_anexos(soup)
                if not anexos:
                    logger.info("No anexos found on pliego page")
                    return []

                logger.info(f"Found {len(anexos)} anexos on pliego page")

                # Step 4: Download each anexo via postback
                hidden_fields = self._extract_hidden_fields(soup)

                for anexo in anexos:
                    try:
                        await asyncio.sleep(self.AUTH_DELAY)  # anti-ban
                        pdf_bytes = await self._download_anexo(
                            session, internal_url, hidden_fields, anexo["postback_target"]
                        )
                        if pdf_bytes and pdf_bytes[:4] == b"%PDF":
                            # Save to storage
                            saved = await self._save_pdf(pdf_bytes, anexo["name"], anexo.get("filename", ""))
                            if saved:
                                from services.pliego_finder import classify_pliego
                                priority, label = classify_pliego(anexo["name"])
                                downloaded.append({
                                    "name": anexo["name"],
                                    "url": saved["url"],
                                    "type": "pdf",
                                    "priority": priority,
                                    "label": label,
                                    "source": "comprar_authenticated",
                                    "local_path": saved["path"],
                                    "size": len(pdf_bytes),
                                })
                    except Exception as e:
                        logger.warning(f"Failed to download anexo {anexo['name']}: {e}")

            except Exception as e:
                logger.error(f"ComprarPliegoDownloader failed: {e}")

        return downloaded

    async def download_pliego_pdf(self, pliego_url: str) -> Optional[bytes]:
        """Download the main pliego PDF from a VistaPreviaPliego URL and return raw bytes.

        Handles login, pliego page access, anexo discovery, and postback download.
        Returns None if any step fails. Does NOT save to disk.
        """
        parsed = urlparse(pliego_url)
        self.base_url = f"{parsed.scheme}://{parsed.netloc}"
        self.domain = parsed.netloc

        await self._load_credentials()
        if not self.user or not self.password:
            logger.warning(f"No credentials for {self.domain} — cannot download pliego")
            return None

        internal_url = pliego_url.replace("VistaPreviaPliegoCiudadano.aspx", "PLIEGO/VistaPreviaPliego.aspx")
        if "PLIEGO/VistaPreviaPliego" not in internal_url:
            qs_match = re.search(r'qs=([^&]+)', pliego_url)
            if qs_match:
                internal_url = f"{self.base_url}/PLIEGO/VistaPreviaPliego.aspx?qs={qs_match.group(1)}"
            else:
                return None

        connector = aiohttp.TCPConnector(ssl=False)
        timeout = aiohttp.ClientTimeout(total=60)

        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            try:
                if not await self._login(session):
                    return None

                async with session.get(internal_url) as resp:
                    if resp.status != 200:
                        logger.warning(f"Pliego page returned {resp.status}")
                        return None
                    html = (await resp.read()).decode("utf-8", errors="replace")

                soup = BeautifulSoup(html, "html.parser")
                anexos = self._find_anexos(soup)
                if not anexos:
                    return None

                hidden_fields = self._extract_hidden_fields(soup)

                for anexo in anexos:
                    await asyncio.sleep(self.AUTH_DELAY)
                    pdf_bytes = await self._download_anexo(
                        session, internal_url, hidden_fields, anexo["postback_target"]
                    )
                    if pdf_bytes and pdf_bytes[:4] == b"%PDF":
                        return pdf_bytes

                return None
            except Exception as e:
                logger.error(f"download_pliego_pdf failed: {e}")
                return None

    async def search_by_number_authenticated(self, numero: str, domain: str = "comprar.mendoza.gov.ar") -> Optional[str]:
        """Search COMPR.AR by process number using AUTHENTICATED session.

        Uses the internal Compras.aspx list (not citizen BuscarAvanzado2).
        This finds processes not visible in the public citizen search,
        like Contrataciones Directas.

        Returns: pliego URL if found, None otherwise.
        """
        self.base_url = f"https://{domain}"
        self.domain = domain
        await self._load_credentials()
        if not self.user or not self.password:
            logger.warning(f"No credentials for {domain}")
            return None

        jar = aiohttp.CookieJar(unsafe=True)
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        connector = aiohttp.TCPConnector(ssl=False)

        try:
            async with aiohttp.ClientSession(headers=headers, cookie_jar=jar, connector=connector) as session:
                # 1. Login
                if not await self._login(session):
                    return None

                await asyncio.sleep(self.AUTH_DELAY)

                # 2. Navigate to internal Compras.aspx list
                list_url = f"{self.base_url}/Compras.aspx"
                async with session.get(list_url) as resp:
                    if resp.status != 200:
                        logger.warning(f"Failed to load Compras.aspx: {resp.status}")
                        return None
                    list_html = (await resp.read()).decode("utf-8", errors="replace")

                soup = BeautifulSoup(list_html, "html.parser")

                # 3. Search the grid for our process number
                # The grid shows processes — scan rows for matching number
                found_target = None
                for row in soup.find_all("tr"):
                    cells = row.find_all("td")
                    row_text = " ".join(c.get_text(strip=True) for c in cells)
                    # Match process number in row text
                    if numero in row_text:
                        # Find the link/postback in this row
                        for a in row.find_all("a", href=True):
                            href = a.get("href", "")
                            if "__doPostBack" in href:
                                m = re.search(r"__doPostBack\('([^']+)'", href)
                                if m:
                                    found_target = m.group(1)
                                    break
                            elif "VistaPreviaPliego" in href:
                                pliego_url = href if href.startswith("http") else f"{self.base_url}/{href.lstrip('/')}"
                                logger.info(f"Found direct pliego link for {numero}: {pliego_url[:80]}")
                                return pliego_url
                        break

                if not found_target:
                    # Try paginating through up to 5 pages
                    for page_num in range(2, 6):
                        await asyncio.sleep(self.AUTH_DELAY)
                        fields = self._extract_hidden_fields(soup)
                        # ASP.NET pager postback
                        fields["__EVENTTARGET"] = f"ctl00$CPH1$GridListaPliegos"
                        fields["__EVENTARGUMENT"] = f"Page${page_num}"

                        async with session.post(list_url, data=fields) as resp:
                            if resp.status != 200:
                                break
                            list_html = (await resp.read()).decode("utf-8", errors="replace")

                        soup = BeautifulSoup(list_html, "html.parser")
                        for row in soup.find_all("tr"):
                            cells = row.find_all("td")
                            row_text = " ".join(c.get_text(strip=True) for c in cells)
                            if numero in row_text:
                                for a in row.find_all("a", href=True):
                                    href = a.get("href", "")
                                    if "__doPostBack" in href:
                                        m = re.search(r"__doPostBack\('([^']+)'", href)
                                        if m:
                                            found_target = m.group(1)
                                            break
                                    elif "VistaPreviaPliego" in href:
                                        pliego_url = href if href.startswith("http") else f"{self.base_url}/{href.lstrip('/')}"
                                        return pliego_url
                                break
                        if found_target:
                            break

                if not found_target:
                    logger.info(f"Process {numero} not found in authenticated Compras.aspx (5 pages)")
                    return None

                # 4. Postback to process detail
                await asyncio.sleep(self.AUTH_DELAY)
                fields = self._extract_hidden_fields(soup)
                fields["__EVENTTARGET"] = found_target
                fields["__EVENTARGUMENT"] = ""

                async with session.post(list_url, data=fields, allow_redirects=False) as resp:
                    if resp.status == 302:
                        location = resp.headers.get("Location", "")
                        if "VistaPreviaPliego" in location:
                            pliego_url = location if location.startswith("http") else f"{self.base_url}/{location.lstrip('/')}"
                            logger.info(f"Authenticated search found pliego for {numero}: {pliego_url[:80]}")
                            return pliego_url

                    # Follow to the detail page and look for pliego link
                    if resp.status in (200, 302):
                        detail_html = ""
                        if resp.status == 302:
                            loc = resp.headers.get("Location", "")
                            detail_url = loc if loc.startswith("http") else f"{self.base_url}/{loc.lstrip('/')}"
                            async with session.get(detail_url) as dr:
                                detail_html = (await dr.read()).decode("utf-8", errors="replace")
                        else:
                            detail_html = (await resp.read()).decode("utf-8", errors="replace")

                        # Find VistaPreviaPliego links in the detail page
                        detail_soup = BeautifulSoup(detail_html, "html.parser")
                        for a in detail_soup.find_all("a", href=True):
                            href = a.get("href", "")
                            if "VistaPreviaPliego" in href:
                                pliego_url = href if href.startswith("http") else f"{self.base_url}/{href.lstrip('/')}"
                                logger.info(f"Found pliego link in detail page for {numero}")
                                return pliego_url

                logger.info(f"Process {numero} found but no pliego link in detail page")
                return None

        except Exception as e:
            logger.error(f"Authenticated search for {numero} failed: {e}")
            return None

    async def _update_credential_status(self, status: str):
        """Update last_status on the matching credential."""
        if self.db is not None and self.domain:
            await self.db.site_credentials.update_one(
                {"enabled": True, "site_url": {"$regex": re.escape(self.domain), "$options": "i"}},
                {"$set": {"last_status": status, "last_used": datetime.now(timezone.utc)}},
            )

    async def _login(self, session: aiohttp.ClientSession) -> bool:
        """Login to COMPR.AR and get session cookies."""
        login_url = f"{self.base_url}/Default.aspx"
        try:
            async with session.get(login_url) as resp:
                html = (await resp.read()).decode("utf-8", errors="replace")

            soup = BeautifulSoup(html, "html.parser")
            fields = self._extract_hidden_fields(soup)
            fields["ctl00$CtrlMenuPortal$logIn$txtUsername$txtTextBox"] = self.user
            fields["ctl00$CtrlMenuPortal$logIn$txtPassword$txtTextBox"] = self.password
            fields["__EVENTTARGET"] = "ctl00$CtrlMenuPortal$logIn$btnIngresar"
            fields["__EVENTARGUMENT"] = ""

            await asyncio.sleep(self.AUTH_DELAY)  # anti-ban: delay before login POST
            async with session.post(login_url, data=fields, allow_redirects=True) as resp:
                if resp.status == 200:
                    body = (await resp.read()).decode("utf-8", errors="replace")
                    if "Bienvenido" in body or "Escritorio" in body or self.user in body.lower():
                        logger.info(f"COMPR.AR login successful ({self.domain})")
                        await self._update_credential_status("OK - Login exitoso")
                        return True
                    logger.warning(f"COMPR.AR login failed on {self.domain} - no welcome message")
                    await self._update_credential_status("ERROR - Login fallido")
                    return False
                logger.warning(f"COMPR.AR login returned {resp.status} on {self.domain}")
                return False
        except Exception as e:
            logger.error(f"COMPR.AR login error ({self.domain}): {e}")
            await self._update_credential_status(f"ERROR - {type(e).__name__}")
            return False

    def _find_anexos(self, soup: BeautifulSoup) -> List[dict]:
        """Find all downloadable anexos on the pliego page."""
        anexos = []
        # Look for the Anexos grid — links with postback to download buttons
        # Patterns: btnVerAnexo, UC_Anexos, UC_CondicionesGenerales, UC_CondicionesParticulares
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            if "__doPostBack" not in href:
                continue
            # Match any download-related postback in the pliego view
            is_download = ("Anexo" in href and "btnVer" in href) or \
                          ("UCVistaPreviaPliego" in href and ("btnDescargar" in href or "btnVer" in href or "UC_A" in href or "UC_C" in href)) or \
                          ("btnDescargar" in href)
            if is_download:
                # Extract postback target
                match = re.search(r"__doPostBack\('([^']+)'", href)
                if match:
                    target = match.group(1)
                    # Find the row to get the name
                    row = a.find_parent("tr")
                    name = ""
                    filename = ""
                    if row:
                        cells = row.find_all("td")
                        for cell in cells:
                            text = cell.get_text(strip=True)
                            if text and ".pdf" in text.lower():
                                filename = text
                            elif text and len(text) > 5 and text not in ("Técnico", "General", "Administrativo"):
                                if not name:
                                    name = text
                        # Also check spans with lblNombreAnnexo
                        for span in row.find_all("span"):
                            sid = span.get("id", "")
                            if "lblNombre" in sid or "lblDescripcion" in sid:
                                t = span.get_text(strip=True)
                                if t:
                                    if ".pdf" in t.lower():
                                        filename = t
                                    else:
                                        name = t

                    anexos.append({
                        "postback_target": target,
                        "name": name or filename or "Anexo",
                        "filename": filename,
                    })

        return anexos

    def _extract_hidden_fields(self, soup: BeautifulSoup) -> dict:
        """Extract ASP.NET hidden fields."""
        fields = {}
        for inp in soup.find_all("input", type="hidden"):
            name = inp.get("name", "")
            if name:
                fields[name] = inp.get("value", "")
        return fields

    async def _download_anexo(
        self, session: aiohttp.ClientSession, page_url: str,
        hidden_fields: dict, postback_target: str
    ) -> Optional[bytes]:
        """Download a single anexo via ASP.NET postback."""
        fields = dict(hidden_fields)
        fields["__EVENTTARGET"] = postback_target
        fields["__EVENTARGUMENT"] = ""

        async with session.post(page_url, data=fields, allow_redirects=True) as resp:
            if resp.status != 200:
                return None
            content_type = resp.headers.get("Content-Type", "")
            if "pdf" in content_type.lower() or "octet" in content_type.lower():
                return await resp.read()
            # Check if it's actually a PDF despite content-type
            data = await resp.read()
            if data[:4] == b"%PDF":
                return data
            return None

    async def _save_pdf(self, pdf_bytes: bytes, name: str, filename: str) -> Optional[dict]:
        """Save PDF to storage directory."""
        try:
            docs_dir = Path(STORAGE_DIR) / "pliegos"
            docs_dir.mkdir(parents=True, exist_ok=True)

            safe_name = re.sub(r"[^\w\-.]", "_", filename or name or "pliego")
            if not safe_name.lower().endswith(".pdf"):
                safe_name += ".pdf"
            unique_name = f"{uuid.uuid4().hex[:8]}_{safe_name}"
            path = docs_dir / unique_name

            with open(path, "wb") as f:
                f.write(pdf_bytes)

            logger.info(f"Saved pliego PDF: {path} ({len(pdf_bytes)} bytes)")
            return {"path": str(path), "url": f"/api/storage/pliegos/{unique_name}"}
        except Exception as e:
            logger.error(f"Failed to save PDF: {e}")
            return None
