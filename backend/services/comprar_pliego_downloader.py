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

STORAGE_DIR = os.environ.get("STORAGE_DIR", "/home/ubuntu/licitometro/storage")


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
        # Look for the Anexos grid - links with postback to btnVerAnexo
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            if "__doPostBack" in href and "Anexo" in href and "btnVer" in href:
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
