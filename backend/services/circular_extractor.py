"""
Circular Extractor — fetches circulares from COMPR.AR authenticated pages.

Uses ComprarPliegoDownloader's login pattern, then navigates Compras.aspx
via ASP.NET postbacks to find a process by licitacion_number and extract
the circulares section from VistaPreviaPliego.
"""
import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional

import aiohttp
from bs4 import BeautifulSoup

logger = logging.getLogger("circular_extractor")


def _utcnow():
    return datetime.now(timezone.utc)


class CircularExtractor:
    """Extract circulares from COMPR.AR authenticated pliego pages."""

    AUTH_DELAY = 2.5
    BASE_URL = "https://comprar.mendoza.gov.ar"

    def __init__(self, db):
        self.db = db
        self.user = ""
        self.password = ""

    async def _load_credentials(self):
        """Load COMPR.AR credentials from site_credentials collection."""
        if self.db:
            cred = await self.db.site_credentials.find_one({
                "enabled": True,
                "site_url": {"$regex": "comprar.mendoza", "$options": "i"},
            })
            if cred:
                self.user = cred.get("username", "")
                self.password = cred.get("password", "")
                return
        self.user = os.environ.get("COMPRAR_USER", "")
        self.password = os.environ.get("COMPRAR_PASS", "")

    def _extract_hidden_fields(self, soup_or_html) -> dict:
        """Extract ASP.NET hidden fields from soup or HTML string."""
        if isinstance(soup_or_html, str):
            soup_or_html = BeautifulSoup(soup_or_html, "html.parser")
        fields = {}
        for inp in soup_or_html.find_all("input", type="hidden"):
            name = inp.get("name", "")
            if name:
                fields[name] = inp.get("value", "")
        return fields

    async def _login(self, session: aiohttp.ClientSession) -> bool:
        """Login to COMPR.AR portal."""
        login_url = f"{self.BASE_URL}/Default.aspx"
        try:
            async with session.get(login_url) as resp:
                html = (await resp.read()).decode("utf-8", errors="replace")
            soup = BeautifulSoup(html, "html.parser")
            fields = self._extract_hidden_fields(soup)
            fields["ctl00$CtrlMenuPortal$logIn$txtUsername$txtTextBox"] = self.user
            fields["ctl00$CtrlMenuPortal$logIn$txtPassword$txtTextBox"] = self.password
            fields["__EVENTTARGET"] = "ctl00$CtrlMenuPortal$logIn$btnIngresar"
            fields["__EVENTARGUMENT"] = ""

            await asyncio.sleep(self.AUTH_DELAY)
            async with session.post(login_url, data=fields, allow_redirects=True) as resp:
                body = (await resp.read()).decode("utf-8", errors="replace")
                if "Bienvenido" in body or "Escritorio" in body:
                    logger.info("COMPR.AR login OK for circular extraction")
                    return True
            logger.warning("COMPR.AR login failed for circular extraction")
            return False
        except Exception as e:
            logger.error(f"Login error: {e}")
            return False

    async def _postback(self, session: aiohttp.ClientSession, url: str, fields: dict) -> Optional[str]:
        """Execute ASP.NET postback."""
        try:
            async with session.post(url, data=fields) as resp:
                if resp.status != 200:
                    return None
                raw = await resp.read()
                try:
                    return raw.decode(resp.charset or "utf-8")
                except (UnicodeDecodeError, LookupError):
                    return raw.decode("latin-1", errors="replace")
        except Exception as e:
            logger.error(f"Postback error: {e}")
            return None

    async def _find_process_in_grid(self, session: aiohttp.ClientSession,
                                     licitacion_number: str) -> Optional[str]:
        """Navigate Compras.aspx grid to find a process and return its detail/pliego HTML."""
        list_url = f"{self.BASE_URL}/Compras.aspx"

        async with session.get(list_url) as resp:
            html = (await resp.read()).decode("utf-8", errors="replace")

        if "problema" in html.lower()[:500]:
            logger.warning("Compras.aspx returned error page")
            return None

        soup = BeautifulSoup(html, "html.parser")
        hidden = self._extract_hidden_fields(soup)

        grid = None
        for grid_id in ["GridListaPliegos", "GridListaProcesos", "grdListadoProcesos"]:
            grid = soup.find("table", id=re.compile(grid_id, re.I))
            if grid:
                break

        max_pages = 15
        for page_num in range(max_pages):
            if grid:
                result = await self._search_grid_page(session, list_url, grid, hidden, licitacion_number)
                if result:
                    return result

            # Paginate
            if page_num < max_pages - 1 and grid:
                next_html = await self._go_to_next_page(session, list_url, grid, hidden, page_num + 2)
                if not next_html:
                    break
                soup = BeautifulSoup(next_html, "html.parser")
                hidden = self._extract_hidden_fields(soup)
                grid = None
                for gid in ["GridListaPliegos", "GridListaProcesos", "grdListadoProcesos"]:
                    grid = soup.find("table", id=re.compile(gid, re.I))
                    if grid:
                        break
            else:
                break

        logger.warning(f"Process {licitacion_number} not found in grid ({page_num + 1} pages searched)")
        return None

    async def _search_grid_page(self, session, list_url, grid, hidden, lic_number) -> Optional[str]:
        """Search current grid page for the licitacion number and click into it."""
        num_parts = lic_number.split("-")
        if len(num_parts) < 2:
            return None

        for row in grid.find_all("tr"):
            row_text = row.get_text(strip=True)
            # Match by parts of the licitacion number
            if num_parts[0] in row_text and num_parts[-1] in row_text:
                link = row.find("a", href=re.compile("__doPostBack"))
                if link:
                    href = link.get("href", "")
                    m = re.search(r"__doPostBack\('([^']+)'", href)
                    if m:
                        target = m.group(1)
                        detail_fields = dict(hidden)
                        detail_fields["__EVENTTARGET"] = target
                        detail_fields["__EVENTARGUMENT"] = ""

                        await asyncio.sleep(self.AUTH_DELAY)
                        detail_html = await self._postback(session, list_url, detail_fields)
                        if detail_html:
                            # Try to follow VistaPreviaPliego link from detail
                            pliego_url = self._find_pliego_url(detail_html)
                            if pliego_url:
                                await asyncio.sleep(self.AUTH_DELAY)
                                async with session.get(pliego_url) as r:
                                    pliego_html = (await r.read()).decode("utf-8", errors="replace")
                                    if "problema" not in pliego_html.lower()[:500]:
                                        return pliego_html
                            return detail_html
        return None

    async def _go_to_next_page(self, session, list_url, grid, hidden, target_page) -> Optional[str]:
        """Navigate to a specific page in the grid."""
        for row in grid.find_all("tr"):
            text = row.get_text(strip=True)
            if re.match(r'^[\d\s.…]+$', text):
                for a in row.find_all("a", href=re.compile("__doPostBack")):
                    if a.get_text(strip=True) == str(target_page):
                        href = a.get("href", "")
                        m = re.search(r"__doPostBack\('([^']+)','([^']*)'", href)
                        if m:
                            fields = dict(hidden)
                            fields["__EVENTTARGET"] = m.group(1)
                            fields["__EVENTARGUMENT"] = m.group(2)
                            await asyncio.sleep(self.AUTH_DELAY)
                            return await self._postback(session, list_url, fields)
                break
        return None

    def _find_pliego_url(self, html: str) -> Optional[str]:
        """Extract VistaPreviaPliego URL from detail page HTML."""
        patterns = [
            r'(PLIEGO/VistaPreviaPliego\.aspx\?qs=[^\s"\'<>&]+)',
            r'(VistaPreviaPliego\.aspx\?qs=[^\s"\'<>&]+)',
        ]
        for pattern in patterns:
            m = re.search(pattern, html)
            if m:
                url = m.group(1)
                if not url.startswith("http"):
                    url = f"{self.BASE_URL}/{url}"
                return url
        return None

    def _parse_circulares(self, html: str) -> List[Dict]:
        """Parse circulares section from VistaPreviaPliego or detail HTML."""
        soup = BeautifulSoup(html, "html.parser")
        circulares = []

        # Strategy 1: Find "Información de la circular" section
        circular_heading = soup.find(string=re.compile(r"Informaci[oó]n de la circular", re.I))
        if circular_heading:
            container = circular_heading.find_parent("div") or circular_heading.find_parent("table")
            if container:
                circ = self._parse_circular_block(container)
                if circ:
                    circulares.append(circ)

        # Strategy 2: Find table rows with circular labels
        if not circulares:
            for table in soup.find_all("table"):
                for row in table.find_all("tr"):
                    cells = row.find_all(["td", "th"])
                    for cell in cells:
                        text = cell.get_text(strip=True).lower()
                        if "mero de circular" in text or "numero de circular" in text:
                            circ = self._parse_circular_table(table)
                            if circ and circ not in circulares:
                                circulares.append(circ)
                            break

        # Strategy 3: Scan for "Circular N°" pattern
        if not circulares:
            for tag in soup.find_all(["strong", "b", "span", "td", "p"]):
                text = tag.get_text(strip=True)
                m = re.match(r'Circular\s+N[°º]?\s*(\d+)', text, re.I)
                if m:
                    circ = {"numero": int(m.group(1))}
                    parent = tag.find_parent(["div", "tr", "table"])
                    if parent:
                        circ["descripcion"] = parent.get_text(" ", strip=True)[:500]
                    if circ not in circulares:
                        circulares.append(circ)

        # Extract aclaraciones for all found circulares
        aclar_heading = soup.find(string=re.compile(r"Aclaraci[oó]n\s+N[°º]", re.I))
        if aclar_heading:
            parent = aclar_heading.find_parent(["div", "table", "tr"])
            if parent:
                desc_cell = parent.find(string=re.compile(r"Descripci[oó]n", re.I))
                if desc_cell:
                    desc_parent = desc_cell.find_parent(["tr", "div"])
                    if desc_parent:
                        tds = desc_parent.find_all("td")
                        for i, td in enumerate(tds):
                            if "descripci" in td.get_text(strip=True).lower() and i + 1 < len(tds):
                                desc_text = tds[i + 1].get_text(strip=True)
                                if circulares:
                                    circulares[-1]["aclaracion"] = desc_text
                                break

        return circulares

    def _parse_circular_block(self, container) -> Optional[Dict]:
        """Parse a circular info block."""
        text = container.get_text(" ", strip=True)
        circ = {}

        m = re.search(r'N[uú]mero de circular[:\s]*(\d+)', text, re.I)
        if m:
            circ["numero"] = int(m.group(1))

        m = re.search(r'Tipo circular[:\s]*(.+?)(?:Tipo de proceso|Fecha|$)', text, re.I)
        if m:
            circ["tipo"] = m.group(1).strip()

        m = re.search(r'Fecha de publicaci[oó]n[:\s]*(\d{1,2}/\d{1,2}/\d{4})', text, re.I)
        if m:
            circ["fecha_publicacion"] = m.group(1)

        m = re.search(r'Motivo[:\s]*(.+?)(?:Aclaraci|$)', text, re.I)
        if m:
            circ["motivo"] = m.group(1).strip()

        m = re.search(r'Aclaraci[oó]n\s+N[°º]\s*\d+.*?Descripci[oó]n[:\s]*(.+)', text, re.I | re.S)
        if m:
            circ["aclaracion"] = m.group(1).strip()[:1000]

        if not circ.get("descripcion"):
            parts = []
            if circ.get("motivo"):
                parts.append(f"Motivo: {circ['motivo']}")
            if circ.get("aclaracion"):
                parts.append(f"Aclaración: {circ['aclaracion']}")
            circ["descripcion"] = ". ".join(parts) if parts else text[:500]

        return circ if circ.get("numero") or circ.get("descripcion") else None

    def _parse_circular_table(self, table) -> Optional[Dict]:
        """Parse a table that contains circular information."""
        circ = {}
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) >= 2:
                label = cells[0].get_text(strip=True).lower()
                value = cells[1].get_text(strip=True)
                if "numero de circular" in label or "número de circular" in label:
                    try:
                        circ["numero"] = int(value)
                    except ValueError:
                        circ["numero"] = value
                elif "tipo circular" in label:
                    circ["tipo"] = value
                elif "tipo de proceso" in label:
                    circ["tipo_proceso"] = value
                elif "fecha" in label and "publicac" in label:
                    circ["fecha_publicacion"] = value
                elif "descripci" in label:
                    circ["aclaracion"] = value[:1000]
        if not circ.get("descripcion"):
            parts = []
            if circ.get("tipo"):
                parts.append(circ["tipo"])
            if circ.get("aclaracion"):
                parts.append(circ["aclaracion"])
            circ["descripcion"] = ". ".join(parts)
        return circ if circ else None

    async def check_circulares(self, licitacion_id: str) -> List[Dict]:
        """Check for circulares on a specific licitacion. Returns list of NEW circulares found."""
        from bson import ObjectId
        lic = await self.db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
        if not lic:
            logger.warning(f"Licitacion {licitacion_id} not found")
            return []

        fuente = lic.get("fuente", "")
        if "COMPR.AR" not in fuente and "comprar" not in fuente.lower():
            return []

        lic_number = lic.get("licitacion_number", "")
        if not lic_number:
            logger.warning(f"No licitacion_number for {licitacion_id}")
            return []

        await self._load_credentials()
        if not self.user or not self.password:
            logger.warning("No COMPR.AR credentials configured")
            return []

        existing_circulares = lic.get("circulares", [])
        existing_nums = {c.get("numero") for c in existing_circulares if c.get("numero")}

        connector = aiohttp.TCPConnector(ssl=False)
        timeout = aiohttp.ClientTimeout(total=120)

        new_circulares = []
        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            if not await self._login(session):
                return []

            await asyncio.sleep(self.AUTH_DELAY)
            pliego_html = await self._find_process_in_grid(session, lic_number)

            if not pliego_html:
                logger.info(f"Could not access pliego page for {lic_number}")
                return []

            found = self._parse_circulares(pliego_html)
            logger.info(f"Found {len(found)} circulares for {lic_number}")

            for circ in found:
                circ_num = circ.get("numero")
                if circ_num and circ_num in existing_nums:
                    continue
                circ["detected_at"] = _utcnow().isoformat()
                circ["source"] = "auto_compr_ar"
                new_circulares.append(circ)

        if new_circulares:
            await self.db.licitaciones.update_one(
                {"_id": ObjectId(licitacion_id)},
                {
                    "$push": {"circulares": {"$each": new_circulares}},
                    "$set": {"updated_at": _utcnow()},
                }
            )
            logger.info(f"Saved {len(new_circulares)} new circulares for {licitacion_id}")
            await self._notify_new_circulares(lic, new_circulares)

        return new_circulares

    async def _notify_new_circulares(self, lic: dict, circulares: List[Dict]):
        """Send Telegram alert for new circulares."""
        try:
            from services.notification_service import get_notification_service
            ns = get_notification_service(self.db)
            title = lic.get("objeto") or lic.get("title", "")
            lic_num = lic.get("licitacion_number", "")
            org = lic.get("organization", "")

            lines = ["🔴 *CIRCULAR NUEVA*", ""]
            lines.append(f"*{lic_num}* — {title[:80]}")
            lines.append(f"Organismo: {org}")
            for c in circulares:
                num = c.get("numero", "?")
                lines.append("")
                lines.append(f"📋 *Circular N° {num}*")
                if c.get("tipo"):
                    lines.append(f"Tipo: {c['tipo']}")
                if c.get("fecha_publicacion"):
                    lines.append(f"Fecha: {c['fecha_publicacion']}")
                if c.get("descripcion"):
                    lines.append(f"{c['descripcion'][:200]}")
            lines.append("")
            lic_id = str(lic.get("_id", ""))
            lines.append(f"[Ver en Licitometro](https://licitometro.ar/cotizar?licitacion_id={lic_id})")

            await ns.send_telegram("\n".join(lines))
        except Exception as e:
            logger.warning(f"Telegram notification failed: {e}")

    async def run_daily_check(self):
        """Daily cron: check circulares for vigente licitaciones with active cotizaciones."""
        logger.info("Starting daily circular check...")

        cot_ids = await self.db.cotizaciones.distinct("licitacion_id")
        if not cot_ids:
            logger.info("No active cotizaciones — skipping circular check")
            return

        from bson import ObjectId
        cot_oids = []
        for cid in cot_ids:
            try:
                cot_oids.append(ObjectId(cid))
            except Exception:
                pass

        lics = await self.db.licitaciones.find({
            "_id": {"$in": cot_oids},
            "fuente": {"$regex": "COMPR.AR", "$options": "i"},
            "estado": {"$in": ["vigente", "prorrogada"]},
            "opening_date": {"$gt": _utcnow()},
        }, {"licitacion_number": 1, "title": 1, "objeto": 1}).to_list(10)

        if not lics:
            logger.info("No vigente COMPR.AR licitaciones with cotizaciones")
            return

        logger.info(f"Checking circulares for {len(lics)} licitaciones")
        total_new = 0
        for lic in lics:
            try:
                new = await self.check_circulares(str(lic["_id"]))
                total_new += len(new)
                await asyncio.sleep(5)
            except Exception as e:
                logger.error(f"Circular check failed for {lic.get('licitacion_number')}: {e}")

        logger.info(f"Daily circular check complete: {total_new} new circulares found")


_instance = None


def get_circular_extractor(db):
    global _instance
    if _instance is None:
        _instance = CircularExtractor(db)
    return _instance
