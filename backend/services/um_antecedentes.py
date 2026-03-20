"""Ultima Milla S.A. — Antecedentes from SGI API + website fallback.

Primary source: SGI API at sgi.ultimamilla.com.ar/api/bot/proyectos (522+ projects)
Fallback: HTML scraping from ultimamilla.com.ar/antecedentes

Caches results in MongoDB collection `um_antecedentes` with 24h TTL refresh.
"""

import asyncio
import logging
import os
import re
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import aiohttp
from bs4 import BeautifulSoup

logger = logging.getLogger("um_antecedentes")

# SGI API config
SGI_API_URL = os.getenv("SGI_API_URL", "https://sgi.ultimamilla.com.ar/api/bot/proyectos")
SGI_API_KEY = os.getenv("SGI_API_KEY", "um_bot_2026_secret_key_here")

# Website fallback
WEBSITE_URL = "https://ultimamilla.com.ar/antecedentes"

CACHE_TTL_HOURS = 24
MAX_PAGES = 30


class UMAntecedenteService:
    """Fetches and caches Ultima Milla antecedentes from SGI + website."""

    def __init__(self, db):
        self.db = db
        self.collection = db.um_antecedentes

    async def ensure_indexes(self):
        await self.collection.create_index("source_id", unique=True)
        await self.collection.create_index(
            [("title", "text"), ("description", "text"), ("client", "text")]
        )
        await self.collection.create_index("sector")
        await self.collection.create_index("cached_at")

    async def search(
        self,
        keywords: Optional[str] = None,
        sector: Optional[str] = None,
        limit: int = 15,
    ) -> List[dict]:
        """Search cached antecedentes. Refreshes cache if stale."""
        latest = await self.collection.find_one(
            {}, sort=[("cached_at", -1)], projection={"cached_at": 1}
        )
        needs_refresh = (
            not latest
            or not latest.get("cached_at")
            or (datetime.now(timezone.utc) - latest["cached_at"]) > timedelta(hours=CACHE_TTL_HOURS)
        )
        if needs_refresh:
            try:
                await self._refresh_cache()
            except Exception as e:
                logger.error(f"Failed to refresh UM antecedentes cache: {e}")

        query = {}
        if keywords:
            query["$text"] = {"$search": keywords}
        if sector:
            query["sector"] = {"$regex": re.escape(sector), "$options": "i"}

        projection = None
        sort_key = [("cached_at", -1)]
        if keywords:
            projection = {"score": {"$meta": "textScore"}}
            sort_key = [("score", {"$meta": "textScore"})]

        try:
            cursor = self.collection.find(query, projection).sort(sort_key).limit(limit)
            docs = await cursor.to_list(limit)
        except Exception:
            fallback_q = {}
            if sector:
                fallback_q["sector"] = {"$regex": re.escape(sector), "$options": "i"}
            docs = await self.collection.find(fallback_q).sort("cached_at", -1).limit(limit).to_list(limit)

        return [self._to_antecedente(d) for d in docs]

    async def _refresh_cache(self):
        """Refresh cache: try SGI API first, fallback to website scraping."""
        sgi_count = await self._refresh_from_sgi()
        if sgi_count > 0:
            logger.info(f"SGI API refresh: {sgi_count} projects cached")
            return

        # Fallback to website scraping
        logger.info("SGI API unavailable, falling back to website scraping")
        web_count = await self._refresh_from_website()
        logger.info(f"Website scraping refresh: {web_count} projects cached")

    async def _refresh_from_sgi(self) -> int:
        """Fetch all projects from SGI API (paginated)."""
        now = datetime.now(timezone.utc)
        total = 0
        page = 1
        page_size = 50

        try:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=30),
                connector=aiohttp.TCPConnector(ssl=False),
                headers={"Authorization": f"Bearer {SGI_API_KEY}"},
            ) as session:
                while True:
                    url = f"{SGI_API_URL}?page={page}&limit={page_size}"
                    async with session.get(url) as resp:
                        if resp.status != 200:
                            logger.warning(f"SGI API returned {resp.status}")
                            break
                        data = await resp.json()

                    proyectos = data.get("proyectos", [])
                    if not proyectos:
                        break

                    for p in proyectos:
                        source_id = f"sgi_{p.get('id', '')}"
                        doc = {
                            "source_id": source_id,
                            "source": "sgi",
                            "title": p.get("nombre", ""),
                            "description": p.get("nombre", ""),
                            "client": p.get("cliente", ""),
                            "sector": self._classify_sector(p.get("nombre", "")),
                            "budget": p.get("presupuesto"),
                            "certificado_total": p.get("certificado_total"),
                            "estado_sgi": p.get("estado"),
                            "url": f"https://sgi.ultimamilla.com.ar/proyectos/ver/{p.get('id', '')}",
                            "sgi_id": p.get("id", ""),
                            "cached_at": now,
                        }
                        await self.collection.update_one(
                            {"source_id": source_id},
                            {"$set": doc},
                            upsert=True,
                        )
                        total += 1

                    # Check if there are more pages
                    pagination = data.get("pagination", {})
                    total_pages = pagination.get("totalPages", 1)
                    if page >= total_pages:
                        break
                    page += 1
                    await asyncio.sleep(0.2)

        except Exception as e:
            logger.error(f"SGI API fetch failed: {e}")

        return total

    async def _refresh_from_website(self) -> int:
        """Fallback: scrape ultimamilla.com.ar/antecedentes."""
        now = datetime.now(timezone.utc)
        total = 0

        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30),
            connector=aiohttp.TCPConnector(ssl=False),
        ) as session:
            for page in range(1, MAX_PAGES + 1):
                url = f"{WEBSITE_URL}?page={page}"
                try:
                    async with session.get(url) as resp:
                        if resp.status != 200:
                            break
                        html = await resp.text()
                except Exception:
                    break

                soup = BeautifulSoup(html, "html.parser")
                items = self._parse_web_page(soup)
                if not items:
                    break

                for item in items:
                    item["source"] = "website"
                    item["cached_at"] = now
                    await self.collection.update_one(
                        {"source_id": item["source_id"]},
                        {"$set": item},
                        upsert=True,
                    )
                    total += 1

                if len(items) < 10:
                    break
                await asyncio.sleep(0.5)

        return total

    def _parse_web_page(self, soup: BeautifulSoup) -> List[dict]:
        """Parse project cards from website HTML."""
        items = []
        cards = soup.select(
            "div.project-card, div.antecedente, article.project, "
            "div.card, div.col-md-4, div.portfolio-item"
        )
        if not cards:
            links = soup.select("a[href*='/antecedentes/']")
            seen = set()
            for a in links:
                parent = a.parent
                if parent and id(parent) not in seen:
                    seen.add(id(parent))
                    cards.append(parent)

        for card in cards:
            try:
                link = card.select_one("a[href*='/antecedentes/']") or card.find("a", href=True)
                if not link:
                    if card.name == "a" and card.get("href"):
                        link = card
                    else:
                        continue

                href = link.get("href", "")
                if not href.startswith("http"):
                    href = f"https://ultimamilla.com.ar{href}"
                source_id = f"web_{href.rstrip('/').split('/')[-1]}"

                title_el = card.select_one("h2, h3, h4, .title, .card-title")
                title = (title_el.get_text(strip=True) if title_el else link.get_text(strip=True)).strip()
                if not title:
                    continue

                desc_el = card.select_one("p, .description, .excerpt")
                description = (desc_el.get_text(strip=True) if desc_el else "").strip()

                cat_el = card.select_one(".category, .sector, .tag, .badge")
                sector = (cat_el.get_text(strip=True) if cat_el else "").strip()

                client_el = card.select_one(".client, .empresa, .company")
                client = (client_el.get_text(strip=True) if client_el else "").strip()

                items.append({
                    "source_id": source_id,
                    "title": title,
                    "description": description,
                    "sector": sector,
                    "client": client,
                    "url": href,
                })
            except Exception:
                continue
        return items

    def _classify_sector(self, nombre: str) -> str:
        """Classify project into sector based on name keywords."""
        n = nombre.lower()
        if any(k in n for k in ["cableado", "fibra", "red", "wifi", "networking", "switch"]):
            return "Redes y Conectividad"
        if any(k in n for k in ["software", "aplicacion", "sistema", "desarrollo", "app", "web"]):
            return "Software y Desarrollo"
        if any(k in n for k in ["cctv", "camara", "vigilancia", "seguridad", "alarma", "deteccion"]):
            return "Seguridad Electronica"
        if any(k in n for k in ["electri", "tablero", "ups", "energia", "data center"]):
            return "Infraestructura Electrica"
        if any(k in n for k in ["soporte", "mantenimiento", "service", "helpdesk", "mesa de ayuda"]):
            return "Soporte y Mantenimiento"
        if any(k in n for k in ["telecom", "telefon", "voip", "pbx", "central"]):
            return "Telecomunicaciones"
        if any(k in n for k in ["server", "servidor", "hosting", "cloud", "virtualizacion"]):
            return "Servidores y Cloud"
        if any(k in n for k in ["licitacion", "licitaci"]):
            return "Licitaciones Publicas"
        return "Servicios IT"

    def _to_antecedente(self, doc: dict) -> dict:
        """Convert cached doc to API response format."""
        return {
            "id": str(doc.get("_id", "")),
            "title": doc.get("title", ""),
            "objeto": doc.get("description", ""),
            "organization": doc.get("client", ""),
            "budget": doc.get("budget"),
            "publication_date": "",
            "category": doc.get("sector", ""),
            "source": f"sgi.ultimamilla.com.ar" if doc.get("source") == "sgi" else "ultimamilla.com.ar",
            "url": doc.get("url", ""),
        }


_instance = None


def get_um_antecedente_service(db):
    global _instance
    if _instance is None or _instance.db is not db:
        _instance = UMAntecedenteService(db)
    return _instance
