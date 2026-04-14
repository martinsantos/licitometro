# Circular Detection & Management System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect, extract, and manage circulares from COMPR.AR for licitaciones being quoted, automatically and manually.

**Architecture:** CircularExtractor service authenticates to COMPR.AR, navigates via HTTP postbacks to find a process, and parses the circulares section from the authenticated VistaPreviaPliego page. A daily cron checks vigente licitaciones with active cotizaciones. Manual loading via CotizAR allows pasting text or uploading circular PDFs. Circular text is injected with maximum priority into AI pliego analysis.

**Tech Stack:** FastAPI, MongoDB (Motor async), aiohttp, BeautifulSoup, APScheduler, React/TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/services/circular_extractor.py` | CREATE | Core: login, navigate, extract circulares from COMPR.AR |
| `backend/services/cron_registry.py` | MODIFY | Register daily circular check cron |
| `backend/routers/licitaciones.py` | MODIFY | Add `POST /{id}/check-circulares` and `POST /{id}/circulares` endpoints |
| `backend/routers/cotizar_ai.py` | MODIFY | Inject circular text into pliego assembly with priority |
| `frontend/src/components/cotizar/OfertaSections.tsx` | MODIFY | Add circulares section UI (display, manual add, re-analyze trigger) |
| `frontend/src/hooks/useCotizarAPI.ts` | MODIFY | Add API methods for circulares |

---

### Task 1: CircularExtractor Service

**Files:**
- Create: `backend/services/circular_extractor.py`

- [ ] **Step 1: Create the service with login + navigation**

```python
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
        """Navigate Compras.aspx grid to find a process and return its VistaPreviaPliego HTML.

        Paginates through the grid looking for the licitacion_number,
        then clicks into the detail row to get the pliego page with circulares.
        """
        list_url = f"{self.BASE_URL}/Compras.aspx"

        async with session.get(list_url) as resp:
            html = (await resp.read()).decode("utf-8", errors="replace")

        if "problema" in html.lower()[:500]:
            logger.warning("Compras.aspx returned error page")
            return None

        soup = BeautifulSoup(html, "html.parser")
        hidden = self._extract_hidden_fields(soup)

        # Find grid and its rows
        grid = None
        for grid_id in ["GridListaPliegos", "GridListaProcesos", "grdListadoProcesos"]:
            grid = soup.find("table", id=re.compile(grid_id, re.I))
            if grid:
                break

        max_pages = 15
        for page_num in range(max_pages):
            # Search current page for our process number
            if grid:
                for row in grid.find_all("tr"):
                    row_text = row.get_text(strip=True)
                    # Match by licitacion number (e.g. "30803-0017-CDI26")
                    num_parts = licitacion_number.split("-")
                    if len(num_parts) >= 2 and num_parts[0] in row_text and num_parts[-1] in row_text:
                        # Found the row - click into detail
                        link = row.find("a", href=re.compile("__doPostBack"))
                        if link:
                            href = link.get("href", "")
                            target_match = re.search(r"__doPostBack\('([^']+)'", href)
                            if target_match:
                                target = target_match.group(1)
                                detail_fields = dict(hidden)
                                detail_fields["__EVENTTARGET"] = target
                                detail_fields["__EVENTARGUMENT"] = ""

                                await asyncio.sleep(self.AUTH_DELAY)
                                detail_html = await self._postback(session, list_url, detail_fields)
                                if detail_html:
                                    # Now we need the VistaPreviaPliego URL from the detail
                                    pliego_url = self._find_pliego_url(detail_html)
                                    if pliego_url:
                                        await asyncio.sleep(self.AUTH_DELAY)
                                        async with session.get(pliego_url) as r:
                                            pliego_html = (await r.read()).decode("utf-8", errors="replace")
                                            if "problema" not in pliego_html.lower()[:500]:
                                                return pliego_html
                                return detail_html  # Return detail page even without pliego redirect

            # Paginate to next page
            if page_num < max_pages - 1:
                # Find pager row and next page link
                pager_found = False
                if grid:
                    for row in grid.find_all("tr"):
                        cells = row.find_all("td")
                        text = row.get_text(strip=True)
                        # Pager rows contain just page numbers
                        if re.match(r'^[\d\s.…]+$', text):
                            # Find next page link
                            for a in row.find_all("a", href=re.compile("__doPostBack")):
                                page_text = a.get_text(strip=True)
                                if page_text == str(page_num + 2):  # Next page number
                                    href = a.get("href", "")
                                    m = re.search(r"__doPostBack\('([^']+)','([^']*)'", href)
                                    if m:
                                        page_fields = dict(hidden)
                                        page_fields["__EVENTTARGET"] = m.group(1)
                                        page_fields["__EVENTARGUMENT"] = m.group(2)
                                        await asyncio.sleep(self.AUTH_DELAY)
                                        next_html = await self._postback(session, list_url, page_fields)
                                        if next_html:
                                            soup = BeautifulSoup(next_html, "html.parser")
                                            hidden = self._extract_hidden_fields(soup)
                                            grid = None
                                            for gid in ["GridListaPliegos", "GridListaProcesos", "grdListadoProcesos"]:
                                                grid = soup.find("table", id=re.compile(gid, re.I))
                                                if grid:
                                                    break
                                            pager_found = True
                                        break
                            break
                if not pager_found:
                    break  # No more pages

        logger.warning(f"Process {licitacion_number} not found in Compras.aspx grid (searched {page_num + 1} pages)")
        return None

    def _find_pliego_url(self, html: str) -> Optional[str]:
        """Extract VistaPreviaPliego URL from detail page HTML."""
        # Look for internal VistaPreviaPliego (not Ciudadano)
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

        # Strategy 2: Find table rows with "Circular" and "Aclaración" labels
        for table in soup.find_all("table"):
            for row in table.find_all("tr"):
                cells = row.find_all(["td", "th"])
                for cell in cells:
                    text = cell.get_text(strip=True).lower()
                    if "n.mero de circular" in text or "numero de circular" in text:
                        # Found a circular info table
                        circ = self._parse_circular_table(table)
                        if circ and circ not in circulares:
                            circulares.append(circ)
                        break

        # Strategy 3: Scan for "Circular N°" pattern in text
        if not circulares:
            for tag in soup.find_all(["strong", "b", "span", "td", "p"]):
                text = tag.get_text(strip=True)
                m = re.match(r'Circular\s+N[°º]?\s*(\d+)', text, re.I)
                if m:
                    circ = {"numero": int(m.group(1))}
                    # Try to extract description from siblings
                    parent = tag.find_parent(["div", "tr", "table"])
                    if parent:
                        full_text = parent.get_text(" ", strip=True)
                        circ["descripcion"] = full_text[:500]
                    if circ not in circulares:
                        circulares.append(circ)

        # Strategy 4: Look for "Aclaraciones" section
        aclar_heading = soup.find(string=re.compile(r"Aclaraci[oó]n\s+N[°º]", re.I))
        if aclar_heading:
            parent = aclar_heading.find_parent(["div", "table", "tr"])
            if parent:
                desc_cell = parent.find(string=re.compile(r"Descripci[oó]n", re.I))
                if desc_cell:
                    desc_parent = desc_cell.find_parent(["tr", "div"])
                    if desc_parent:
                        # Get the value cell (next td)
                        tds = desc_parent.find_all("td")
                        for i, td in enumerate(tds):
                            if "descripci" in td.get_text(strip=True).lower() and i + 1 < len(tds):
                                desc_text = tds[i + 1].get_text(strip=True)
                                if circulares:
                                    circulares[-1]["aclaracion"] = desc_text
                                break

        return circulares

    def _parse_circular_block(self, container) -> Optional[Dict]:
        """Parse a circular info block (div or table with labeled fields)."""
        text = container.get_text(" ", strip=True)
        circ = {}

        # Extract fields by label patterns
        m = re.search(r'N[uú]mero de circular[:\s]*(\d+)', text, re.I)
        if m: circ["numero"] = int(m.group(1))

        m = re.search(r'Tipo circular[:\s]*(.+?)(?:Tipo de proceso|Fecha|$)', text, re.I)
        if m: circ["tipo"] = m.group(1).strip()

        m = re.search(r'Tipo de proceso[:\s]*(.+?)(?:Fecha|N[uú]mero|$)', text, re.I)
        if m: circ["tipo_proceso"] = m.group(1).strip()

        m = re.search(r'Fecha de publicaci[oó]n[:\s]*(\d{1,2}/\d{1,2}/\d{4})', text, re.I)
        if m: circ["fecha_publicacion"] = m.group(1)

        m = re.search(r'Motivo[:\s]*(.+?)(?:Aclaraci|$)', text, re.I)
        if m: circ["motivo"] = m.group(1).strip()

        # Extract aclaraciones
        m = re.search(r'Aclaraci[oó]n\s+N[°º]\s*\d+.*?Descripci[oó]n[:\s]*(.+)', text, re.I | re.S)
        if m: circ["aclaracion"] = m.group(1).strip()[:1000]

        if not circ.get("descripcion"):
            parts = []
            if circ.get("motivo"): parts.append(f"Motivo: {circ['motivo']}")
            if circ.get("aclaracion"): parts.append(f"Aclaración: {circ['aclaracion']}")
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
                    try: circ["numero"] = int(value)
                    except: circ["numero"] = value
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
            if circ.get("tipo"): parts.append(circ["tipo"])
            if circ.get("aclaracion"): parts.append(circ["aclaracion"])
            circ["descripcion"] = ". ".join(parts)
        return circ if circ else None

    async def check_circulares(self, licitacion_id: str) -> List[Dict]:
        """Check for circulares on a specific licitacion.

        Returns list of new circulares found (already saved to DB).
        """
        from bson import ObjectId
        lic = await self.db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
        if not lic:
            logger.warning(f"Licitacion {licitacion_id} not found")
            return []

        fuente = lic.get("fuente", "")
        if "COMPR.AR" not in fuente and "comprar" not in fuente.lower():
            logger.info(f"Skipping non-COMPR.AR licitacion: {fuente}")
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
                    continue  # Already known
                circ["detected_at"] = _utcnow().isoformat()
                circ["source"] = "auto_compr_ar"
                new_circulares.append(circ)

        # Save new circulares to DB
        if new_circulares:
            await self.db.licitaciones.update_one(
                {"_id": ObjectId(licitacion_id)},
                {
                    "$push": {"circulares": {"$each": new_circulares}},
                    "$set": {"updated_at": _utcnow()},
                }
            )
            logger.info(f"Saved {len(new_circulares)} new circulares for {licitacion_id}")

            # Send Telegram notification
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

            lines = [f"🔴 *CIRCULAR NUEVA*", ""]
            lines.append(f"*{lic_num}* — {title[:80]}")
            lines.append(f"Organismo: {org}")
            for c in circulares:
                lines.append("")
                num = c.get("numero", "?")
                lines.append(f"📋 *Circular N° {num}*")
                if c.get("tipo"): lines.append(f"Tipo: {c['tipo']}")
                if c.get("fecha_publicacion"): lines.append(f"Fecha: {c['fecha_publicacion']}")
                if c.get("descripcion"): lines.append(f"{c['descripcion'][:200]}")
            lines.append("")
            lic_id = str(lic.get("_id", ""))
            lines.append(f"[Ver en Licitometro](https://licitometro.ar/cotizar?licitacion_id={lic_id})")

            await ns.send_telegram("\n".join(lines))
        except Exception as e:
            logger.warning(f"Telegram notification failed: {e}")

    async def run_daily_check(self):
        """Daily cron: check circulares for vigente licitaciones with active cotizaciones."""
        logger.info("Starting daily circular check...")

        # Find vigente COMPR.AR licitaciones with active cotizaciones and future opening_date
        pipeline = [
            {"$match": {
                "fuente": {"$regex": "COMPR.AR", "$options": "i"},
                "estado": {"$in": ["vigente", "prorrogada"]},
                "opening_date": {"$gt": _utcnow()},
            }},
            {"$lookup": {
                "from": "cotizaciones",
                "localField": "_id",
                "foreignField": "licitacion_id",
                "as": "cot",
                "pipeline": [{"$project": {"_id": 1}}],
            }},
            {"$match": {"cot": {"$ne": []}}},
            {"$limit": 10},
            {"$project": {"licitacion_number": 1, "title": 1, "objeto": 1}},
        ]

        # $lookup needs string ID match — use alternative approach
        # Get cotizacion licitacion_ids first
        cot_ids = await self.db.cotizaciones.distinct("licitacion_id")
        if not cot_ids:
            logger.info("No active cotizaciones — skipping circular check")
            return

        from bson import ObjectId
        cot_oids = []
        for cid in cot_ids:
            try: cot_oids.append(ObjectId(cid))
            except: pass

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
                await asyncio.sleep(5)  # Courtesy delay between processes
            except Exception as e:
                logger.error(f"Circular check failed for {lic.get('licitacion_number')}: {e}")

        logger.info(f"Daily circular check complete: {total_new} new circulares found")


_instance = None

def get_circular_extractor(db):
    global _instance
    if _instance is None:
        _instance = CircularExtractor(db)
    return _instance
```

- [ ] **Step 2: Verify syntax**

Run: `python3 -m py_compile backend/services/circular_extractor.py`
Expected: No output (success)

- [ ] **Step 3: Commit**

```bash
git add backend/services/circular_extractor.py
git commit -m "feat: CircularExtractor service — COMPR.AR login, grid navigation, circular parsing"
```

---

### Task 2: Register Daily Cron + API Endpoint

**Files:**
- Modify: `backend/services/cron_registry.py`
- Modify: `backend/routers/licitaciones.py`

- [ ] **Step 1: Add cron job to registry**

In `backend/services/cron_registry.py`, add to `CRON_JOBS` list before the closing `]`:

```python
    {
        "id": "circular_daily_check",
        "name": "Daily circular check (vigente + cotizando)",
        "trigger": CronTrigger(hour=20, minute=0),
        "service_module": "services.circular_extractor",
        "service_factory": "get_circular_extractor",
        "method": "run_daily_check",
        "max_instances": 1,
    },
```

- [ ] **Step 2: Add API endpoints to licitaciones router**

In `backend/routers/licitaciones.py`, add these endpoints (before the `/{licitacion_id}` catch-all route):

```python
@router.post("/{licitacion_id}/check-circulares")
async def check_circulares(licitacion_id: str, request: Request):
    """Check for new circulares on COMPR.AR for this licitacion."""
    db = request.app.mongodb
    from services.circular_extractor import get_circular_extractor
    extractor = get_circular_extractor(db)
    new_circulares = await extractor.check_circulares(licitacion_id)
    return {
        "success": True,
        "new_circulares": len(new_circulares),
        "circulares": new_circulares,
    }


@router.post("/{licitacion_id}/circulares")
async def add_circular_manual(licitacion_id: str, body: Dict[str, Any], request: Request):
    """Manually add a circular to a licitacion."""
    db = request.app.mongodb
    from bson import ObjectId

    lic = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
    if not lic:
        raise HTTPException(404, "Licitacion not found")

    circular = {
        "numero": body.get("numero"),
        "tipo": body.get("tipo", "Aclaratoria"),
        "fecha_publicacion": body.get("fecha_publicacion"),
        "descripcion": body.get("descripcion", ""),
        "aclaracion": body.get("aclaracion", ""),
        "motivo": body.get("motivo", ""),
        "source": "manual",
        "detected_at": utc_now().isoformat(),
    }

    await db.licitaciones.update_one(
        {"_id": ObjectId(licitacion_id)},
        {
            "$push": {"circulares": circular},
            "$set": {"updated_at": utc_now()},
        }
    )

    return {"success": True, "circular": circular}
```

Add the necessary import at the top of the file if not present:
```python
from typing import Dict, Any
```

- [ ] **Step 3: Verify syntax**

Run: `python3 -m py_compile backend/services/cron_registry.py && python3 -m py_compile backend/routers/licitaciones.py && echo OK`

- [ ] **Step 4: Commit**

```bash
git add backend/services/cron_registry.py backend/routers/licitaciones.py
git commit -m "feat: circular check cron (20:00 daily) + manual add/check API endpoints"
```

---

### Task 3: Inject Circulares into AI Pliego Assembly

**Files:**
- Modify: `backend/routers/cotizar_ai.py`

- [ ] **Step 1: Add circular text to pliego assembly in `/extract-pliego-info`**

In `backend/routers/cotizar_ai.py`, in the text assembly section (after the "DATOS ESTRUCTURADOS" block that checks `lic.get("garantias")`), add:

```python
    # Circulares — HIGH PRIORITY: these MODIFY the base pliego
    if lic.get("circulares"):
        circ_parts = []
        for c in lic["circulares"]:
            num = c.get("numero", "?")
            circ_parts.append(f"Circular N° {num}")
            if c.get("fecha_publicacion"): circ_parts.append(f"  Fecha: {c['fecha_publicacion']}")
            if c.get("tipo"): circ_parts.append(f"  Tipo: {c['tipo']}")
            if c.get("motivo"): circ_parts.append(f"  Motivo: {c['motivo']}")
            if c.get("aclaracion"): circ_parts.append(f"  Aclaración: {c['aclaracion']}")
            if c.get("descripcion"): circ_parts.append(f"  Descripción: {c['descripcion']}")
            circ_parts.append("")
        parts.append("\n=== CIRCULARES (MÁXIMA PRIORIDAD — modifican el pliego base) ===")
        parts.append("IMPORTANTE: Las circulares CORRIGEN y tienen PRIORIDAD sobre el pliego original.")
        parts.append("Si una circular contradice algo del pliego, la circular PREVALECE.")
        parts.append("\n".join(circ_parts))
```

- [ ] **Step 2: Also inject in `/analyze-pliego-gaps` prompt**

In the `/analyze-pliego-gaps` endpoint, before the Groq LLM call, add circular text to the prompt:

```python
    # Add circulares to gap analysis if they exist
    lic = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)}, {"circulares": 1})
    circular_text = ""
    if lic and lic.get("circulares"):
        circ_lines = ["CIRCULARES (modifican el pliego — máxima prioridad):"]
        for c in lic["circulares"]:
            num = c.get("numero", "?")
            circ_lines.append(f"- Circular N° {num}: {c.get('descripcion', '')} {c.get('aclaracion', '')}")
        circular_text = "\n".join(circ_lines)

    # Include in prompt (before the pliego excerpt)
    if circular_text:
        pliego_text = circular_text + "\n\n" + pliego_text
```

- [ ] **Step 3: Verify syntax**

Run: `python3 -m py_compile backend/routers/cotizar_ai.py && echo OK`

- [ ] **Step 4: Commit**

```bash
git add backend/routers/cotizar_ai.py
git commit -m "feat: inject circulares into pliego AI assembly with max priority"
```

---

### Task 4: Frontend — Circulares Section in CotizAR

**Files:**
- Modify: `frontend/src/hooks/useCotizarAPI.ts`
- Modify: `frontend/src/components/cotizar/OfertaSections.tsx`

- [ ] **Step 1: Add API methods to useCotizarAPI.ts**

Add these methods inside the return object of `useCotizarAPI()`:

```typescript
    async checkCirculares(licitacionId: string): Promise<{ new_circulares: number; circulares: Array<Record<string, unknown>> }> {
      return apiFetchMain(`/licitaciones/${licitacionId}/check-circulares`, { method: 'POST' });
    },

    async addCircularManual(licitacionId: string, circular: Record<string, string>): Promise<{ success: boolean }> {
      return apiFetchMain(`/licitaciones/${licitacionId}/circulares`, {
        method: 'POST',
        body: JSON.stringify(circular),
      });
    },
```

- [ ] **Step 2: Add circulares UI to OfertaSections.tsx**

Add these props to the `Props` interface:

```typescript
  licitacionId: string;  // already exists
  // Add:
  circulares?: Array<{ numero?: number; tipo?: string; fecha_publicacion?: string; descripcion?: string; aclaracion?: string; source?: string }>;
  onCircularesChange?: (circulares: Array<Record<string, unknown>>) => void;
```

Add state inside the component:

```typescript
  const [circularText, setCircularText] = useState('');
  const [circularNumero, setCircularNumero] = useState('');
  const [checkingCirculares, setCheckingCirculares] = useState(false);
  const [circularStatus, setCircularStatus] = useState('');
```

Add the circulares UI section BEFORE the "Pliegos encontrados" section:

```tsx
      {/* ─── Circulares Section ─── */}
      <div className="border border-rose-200 rounded-xl overflow-hidden bg-rose-50/30">
        <div className="px-4 py-3 flex items-center justify-between bg-rose-100/50">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="font-semibold text-rose-800 text-sm">Circulares</span>
            {(circulares?.length ?? 0) > 0 && (
              <span className="text-xs bg-rose-200 text-rose-800 px-1.5 py-0.5 rounded-full font-bold">{circulares!.length}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setCheckingCirculares(true);
                setCircularStatus('Verificando en COMPR.AR...');
                try {
                  const result = await api.checkCirculares(licitacionId);
                  if (result.new_circulares > 0) {
                    setCircularStatus(`${result.new_circulares} circular(es) nueva(s) encontrada(s)`);
                    onCircularesChange?.(result.circulares);
                  } else {
                    setCircularStatus('Sin circulares nuevas');
                  }
                } catch { setCircularStatus('Error al verificar'); }
                finally {
                  setCheckingCirculares(false);
                  setTimeout(() => setCircularStatus(''), 5000);
                }
              }}
              disabled={checkingCirculares}
              className="text-xs px-3 py-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors"
            >
              {checkingCirculares ? 'Verificando...' : 'Verificar en COMPR.AR'}
            </button>
          </div>
        </div>

        {circularStatus && (
          <div className="px-4 py-2 text-xs text-rose-700 bg-rose-100">{circularStatus}</div>
        )}

        {/* Existing circulares */}
        {circulares && circulares.length > 0 && (
          <div className="px-4 py-3 space-y-2">
            {circulares.map((c, i) => (
              <div key={i} className="bg-white rounded-lg p-3 border border-rose-200">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-rose-700 text-sm">Circular N° {c.numero ?? '?'}</span>
                  <div className="flex items-center gap-2">
                    {c.fecha_publicacion && <span className="text-xs text-rose-500">{c.fecha_publicacion}</span>}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-600">{c.source === 'manual' ? 'Manual' : 'Auto'}</span>
                  </div>
                </div>
                {c.tipo && <p className="text-xs text-gray-500 mt-0.5">Tipo: {c.tipo}</p>}
                {c.descripcion && <p className="text-sm text-gray-700 mt-1">{c.descripcion}</p>}
                {c.aclaracion && (
                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-gray-800">
                    <span className="text-xs font-semibold text-amber-700">Aclaración: </span>
                    {c.aclaracion}
                  </div>
                )}
              </div>
            ))}
            <p className="text-[10px] text-rose-500 italic">Las circulares MODIFICAN el pliego y tienen PRIORIDAD al regenerar secciones.</p>
          </div>
        )}

        {/* Manual circular input */}
        <div className="px-4 py-3 border-t border-rose-200">
          <p className="text-xs font-medium text-rose-700 mb-2">Cargar circular manualmente</p>
          <div className="flex gap-2 mb-2">
            <input
              type="text" value={circularNumero}
              onChange={e => setCircularNumero(e.target.value)}
              placeholder="N° circular"
              className="w-20 border border-rose-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
            <input
              type="text" value={circularText.split('\n')[0] || ''}
              onChange={e => {
                const lines = circularText.split('\n');
                lines[0] = e.target.value;
                setCircularText(lines.join('\n'));
              }}
              placeholder="Motivo (ej: Pliego de condiciones particulares)"
              className="flex-1 border border-rose-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
          </div>
          <textarea
            value={circularText.includes('\n') ? circularText.split('\n').slice(1).join('\n') : ''}
            onChange={e => {
              const motivo = circularText.split('\n')[0] || '';
              setCircularText(motivo + '\n' + e.target.value);
            }}
            placeholder="Pega el texto de la aclaración aqui..."
            rows={3}
            className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 resize-y mb-2"
          />
          <button
            onClick={async () => {
              if (!circularText.trim()) return;
              const parts = circularText.split('\n');
              const motivo = parts[0] || '';
              const aclaracion = parts.slice(1).join('\n').trim();
              try {
                await api.addCircularManual(licitacionId, {
                  numero: circularNumero || '1',
                  tipo: 'Aclaratoria',
                  motivo,
                  aclaracion,
                  descripcion: motivo,
                  fecha_publicacion: new Date().toLocaleDateString('es-AR'),
                });
                setCircularText('');
                setCircularNumero('');
                setCircularStatus('Circular guardada — regenera secciones para aplicarla');
                // Reload licitacion to get updated circulares
                onCircularesChange?.([]);
              } catch { setCircularStatus('Error al guardar'); }
            }}
            disabled={!circularText.trim()}
            className="text-xs px-4 py-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors"
          >
            Guardar circular
          </button>
        </div>
      </div>
```

- [ ] **Step 3: Pass circulares from OfertaEditor to OfertaSections**

In `OfertaEditor.tsx`, add state for circulares and pass to OfertaSections:

```typescript
// Add state (near other state declarations)
const [circulares, setCirculares] = useState<Array<Record<string, unknown>>>([]);

// In the mount effect, load circulares from licitacion:
// After loading from MongoDB, fetch licitacion details
try {
  const licResp = await fetch(`/api/licitaciones/${licitacion.id}`, { credentials: 'include' });
  if (licResp.ok) {
    const licData = await licResp.json();
    if (licData.circulares) setCirculares(licData.circulares);
  }
} catch { /* silent */ }

// Pass to OfertaSections:
<OfertaSections
  // ... existing props ...
  circulares={circulares}
  onCircularesChange={(newCircs) => {
    // Reload circulares from API
    fetch(`/api/licitaciones/${licitacion.id}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (data.circulares) setCirculares(data.circulares); })
      .catch(() => {});
  }}
/>
```

- [ ] **Step 4: Build and verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useCotizarAPI.ts frontend/src/components/cotizar/OfertaSections.tsx frontend/src/components/cotizar/OfertaEditor.tsx
git commit -m "feat: CotizAR circulares UI — verify COMPR.AR, manual add, display with priority"
```

---

### Task 5: Deploy and Test

- [ ] **Step 1: Push and deploy**

```bash
git push origin licitometro-servicio
git checkout main && git merge licitometro-servicio --no-edit && git push origin main
git checkout licitometro-servicio
```

- [ ] **Step 2: Verify deployment**

Watch CI/CD: `gh run watch $(gh run list --limit 1 --repo martinsantos/licitometro --workflow production.yml --json databaseId -q '.[0].databaseId') --repo martinsantos/licitometro`

- [ ] **Step 3: Test manual circular on the target licitacion**

From VPS, manually add the circular that the user received:

```bash
ssh root@76.13.234.213 'docker exec licitometro-backend-1 curl -s -X POST \
  "http://localhost:8000/api/licitaciones/69dd052c63dc304b4209e5d9/circulares" \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=TOKEN" \
  -d "{\"numero\":\"1\",\"tipo\":\"Aclaratoria - Sin consulta\",\"fecha_publicacion\":\"14/04/2026\",\"motivo\":\"Pliego de condiciones particulares\",\"aclaracion\":\"A los efectos de presentar la oferta pertinente, no debe ser tenida en cuenta la parte pertinente del Pliego de Condiciones particulares que hace referencia a la necesidad de cumplir requisitos sanitarios.\",\"descripcion\":\"Circular que elimina requisitos sanitarios del pliego\"}"'
```

- [ ] **Step 4: Test auto-check via API**

```bash
ssh root@76.13.234.213 'docker exec licitometro-backend-1 curl -s -X POST \
  "http://localhost:8000/api/licitaciones/69dd052c63dc304b4209e5d9/check-circulares" \
  -H "Cookie: access_token=TOKEN"'
```

- [ ] **Step 5: Verify in CotizAR UI**

Navigate to https://licitometro.ar/cotizar?licitacion_id=69dd052c63dc304b4209e5d9
- Go to Step 6 (Secciones)
- Verify "Circulares" section appears with the loaded circular
- Click "Regenerar con IA" on any section — verify circular text appears in context
- Click "Analizar gaps" — verify circular is considered
