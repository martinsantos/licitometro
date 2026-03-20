"""Ultima Milla S.A. — Antecedentes from website scraping + SGI API enrichment.

Primary source: HTML scraping from ultimamilla.com.ar/antecedentes (518+ projects)
Enrichment: SGI API at sgi.ultimamilla.com.ar/api/bot/proyectos (financial data)

Caches results in MongoDB collection `um_antecedentes` with 24h TTL refresh.
"""

import asyncio
import logging
import os
import re
from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher
from typing import List, Optional, Tuple

import aiohttp
from bs4 import BeautifulSoup

logger = logging.getLogger("um_antecedentes")

# SGI API config
SGI_API_URL = os.getenv("SGI_API_URL", "https://sgi.ultimamilla.com.ar/api/bot/proyectos")
SGI_API_KEY = os.getenv("SGI_API_KEY", "um_bot_2026_secret_key_here")

# Website
WEBSITE_BASE = "https://ultimamilla.com.ar"
WEBSITE_URL = f"{WEBSITE_BASE}/antecedentes"

CACHE_TTL_HOURS = 24
MAX_PAGES = 30

# Simplified annual IPC rates for Argentina
IPC_RATES = {
    2008: 23, 2009: 15, 2010: 22, 2011: 23, 2012: 25, 2013: 28,
    2014: 38, 2015: 27, 2016: 40, 2017: 25, 2018: 48, 2019: 54,
    2020: 36, 2021: 51, 2022: 95, 2023: 211, 2024: 118, 2025: 45, 2026: 20,
}


def adjust_for_inflation(amount: float, from_year: int, to_year: int = 2026) -> Tuple[float, float]:
    """Apply IPC inflation from from_year to to_year. Returns (adjusted_amount, coefficient)."""
    if not amount or from_year >= to_year or from_year < 2000:
        return amount, 1.0
    coef = 1.0
    for y in range(from_year, to_year):
        rate = IPC_RATES.get(y, 30) / 100
        coef *= (1 + rate)
    return round(amount * coef, 2), round(coef, 4)


class UMAntecedenteService:
    """Fetches and caches Ultima Milla antecedentes from website + SGI."""

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

    async def get_sectors(self) -> List[dict]:
        """Return distinct sectors with counts."""
        pipeline = [
            {"$match": {"sector": {"$exists": True, "$ne": ""}}},
            {"$group": {"_id": "$sector", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        results = await self.collection.aggregate(pipeline).to_list(100)
        return [{"sector": r["_id"], "count": r["count"]} for r in results]

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
            or (datetime.utcnow() - latest["cached_at"]) > timedelta(hours=CACHE_TTL_HOURS)
        )
        if needs_refresh:
            try:
                await self._refresh_cache()
            except Exception as e:
                logger.error(f"Failed to refresh UM antecedentes cache: {e}")

        query: dict = {}
        if keywords:
            query["$text"] = {"$search": keywords}
        if sector:
            query["sector"] = {"$regex": re.escape(sector), "$options": "i"}

        projection = None
        sort_key: list = [("cached_at", -1)]
        if keywords:
            projection = {"score": {"$meta": "textScore"}}
            sort_key = [("score", {"$meta": "textScore"})]

        try:
            cursor = self.collection.find(query, projection).sort(sort_key).limit(limit)
            docs = await cursor.to_list(limit)
        except Exception:
            fallback_q: dict = {}
            if sector:
                fallback_q["sector"] = {"$regex": re.escape(sector), "$options": "i"}
            docs = await self.collection.find(fallback_q).sort("cached_at", -1).limit(limit).to_list(limit)

        return [self._to_antecedente(d) for d in docs]

    async def _refresh_cache(self):
        """Refresh cache: scrape website first, then enrich with SGI API."""
        web_count = await self._refresh_from_website()
        logger.info(f"Website scraping: {web_count} antecedentes cached")

        if web_count > 0:
            sgi_count = await self._enrich_from_sgi()
            logger.info(f"SGI enrichment: {sgi_count} antecedentes enriched")
        else:
            # Fallback: SGI-only if website fails
            sgi_count = await self._refresh_from_sgi_only()
            logger.info(f"SGI-only fallback: {sgi_count} projects cached")

    async def _refresh_from_website(self) -> int:
        """Primary: scrape ultimamilla.com.ar/antecedentes (26 pages × 20 items)."""
        now = datetime.utcnow()
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
                        raw = await resp.read()
                        html = raw.decode("utf-8", errors="replace")
                except Exception as e:
                    logger.warning(f"Website page {page} fetch failed: {e}")
                    break

                soup = BeautifulSoup(html, "html.parser")
                items = self._parse_web_page(soup)
                if not items:
                    break

                for item in items:
                    item["source"] = "website"
                    item["cached_at"] = now

                    # Apply IPC inflation if we have budget and date
                    if item.get("presupuesto_original") and item.get("fecha_proyecto"):
                        try:
                            year = int(item["fecha_proyecto"][:4])
                            adj, coef = adjust_for_inflation(item["presupuesto_original"], year)
                            item["presupuesto_actualizado"] = adj
                            item["ipc_coeficiente"] = coef
                        except (ValueError, TypeError):
                            pass

                    await self.collection.update_one(
                        {"source_id": item["source_id"]},
                        {"$set": item},
                        upsert=True,
                    )
                    total += 1

                if len(items) < 10:
                    break
                await asyncio.sleep(0.3)

        return total

    def _parse_web_page(self, soup: BeautifulSoup) -> List[dict]:
        """Parse project cards from website HTML listing page."""
        items = []

        # Find all links to detail pages /antecedentes/{id}/{slug}
        links = soup.find_all("a", href=re.compile(r"/antecedentes/\d+/"))
        seen_ids: set = set()

        for link in links:
            try:
                href = link.get("href", "")
                # Extract project ID from URL: /antecedentes/3064/slug
                id_match = re.search(r"/antecedentes/(\d+)/", href)
                if not id_match:
                    continue
                project_id = id_match.group(1)
                if project_id in seen_ids:
                    continue
                seen_ids.add(project_id)

                source_id = f"web_{project_id}"
                if not href.startswith("http"):
                    href = f"{WEBSITE_BASE}{href}"

                # Extract image URL (UUID pattern)
                img = link.find("img")
                image_url = ""
                if img and img.get("src"):
                    src = img["src"]
                    if not src.startswith("http"):
                        src = f"{WEBSITE_BASE}{src}"
                    image_url = src

                # Extract title from h3
                h3 = link.find("h3")
                title = (h3.get_text(strip=True) if h3 else link.get_text(strip=True)).strip()
                if not title or len(title) < 3:
                    continue

                # Extract description from p tag
                p_tag = link.find("p")
                description = (p_tag.get_text(strip=True) if p_tag else "").strip()

                # Extract sector badge — look for span/div with short text before h3
                sector = ""
                for el in link.find_all(["span", "div"]):
                    text = el.get_text(strip=True)
                    # Sector badges are short category labels, not the title or description
                    if text and 5 < len(text) < 60 and text != title and text != description:
                        # Skip "Ver detalle" type links
                        if "ver detalle" in text.lower() or "ver más" in text.lower():
                            continue
                        sector = text
                        break

                # Extract client — usually the last text element before "Ver detalle"
                client = ""
                all_texts = [t.strip() for t in link.stripped_strings]
                # Pattern: [..., sector, title, description, client, "Ver detalle"]
                for t in reversed(all_texts):
                    if t.lower() in ("ver detalle", "ver más", "→"):
                        continue
                    if t == title or t == description or t == sector:
                        continue
                    if len(t) > 2 and len(t) < 100:
                        client = t
                        break

                items.append({
                    "source_id": source_id,
                    "title": title,
                    "description": description,
                    "sector": sector,
                    "client": client,
                    "image_url": image_url,
                    "detail_url": href,
                    "project_id": project_id,
                })
            except Exception:
                continue

        return items

    async def _enrich_from_sgi(self) -> int:
        """Enrich website-scraped items with SGI API data (financial info)."""
        enriched = 0

        try:
            sgi_projects = await self._fetch_all_sgi()
        except Exception as e:
            logger.error(f"SGI API fetch for enrichment failed: {e}")
            return 0

        if not sgi_projects:
            return 0

        # Build lookup by normalized title for fuzzy matching
        sgi_by_name = {}
        for p in sgi_projects:
            name = (p.get("nombre") or "").strip().lower()
            if name:
                sgi_by_name[name] = p

        # Get all website items
        cursor = self.collection.find({"source": "website"}, {"source_id": 1, "title": 1})
        web_items = await cursor.to_list(1000)

        for item in web_items:
            title_lower = (item.get("title") or "").strip().lower()
            if not title_lower:
                continue

            # Try exact match first, then fuzzy
            matched = sgi_by_name.get(title_lower)
            if not matched:
                best_ratio = 0.0
                for name, p in sgi_by_name.items():
                    ratio = SequenceMatcher(None, title_lower, name).ratio()
                    if ratio > best_ratio and ratio > 0.7:
                        best_ratio = ratio
                        matched = p

            if matched:
                update: dict = {
                    "sgi_id": matched.get("id", ""),
                    "estado_sgi": matched.get("estado"),
                    "certificado_total": matched.get("certificado_total"),
                }
                budget = matched.get("presupuesto")
                if budget:
                    update["presupuesto_original"] = budget
                fecha_inicio = matched.get("fechaInicio")
                if fecha_inicio:
                    update["fecha_inicio"] = fecha_inicio
                fecha_cierre = matched.get("fechaFin") or matched.get("fechaCierre")
                if fecha_cierre:
                    update["fecha_cierre"] = fecha_cierre

                await self.collection.update_one(
                    {"source_id": item["source_id"]},
                    {"$set": update},
                )
                enriched += 1

        return enriched

    async def _fetch_all_sgi(self) -> List[dict]:
        """Fetch all projects from SGI API."""
        all_projects = []
        page = 1
        page_size = 50

        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30),
            connector=aiohttp.TCPConnector(ssl=False),
            headers={"Authorization": f"Bearer {SGI_API_KEY}"},
        ) as session:
            while True:
                url = f"{SGI_API_URL}?page={page}&limit={page_size}"
                try:
                    async with session.get(url) as resp:
                        if resp.status != 200:
                            break
                        data = await resp.json()
                except Exception:
                    break

                proyectos = data.get("proyectos", [])
                if not proyectos:
                    break
                all_projects.extend(proyectos)

                pagination = data.get("pagination", {})
                if page >= pagination.get("totalPages", 1):
                    break
                page += 1
                await asyncio.sleep(0.2)

        return all_projects

    async def _refresh_from_sgi_only(self) -> int:
        """Fallback: populate cache from SGI API only (when website is down)."""
        now = datetime.utcnow()
        total = 0

        try:
            projects = await self._fetch_all_sgi()
        except Exception as e:
            logger.error(f"SGI-only refresh failed: {e}")
            return 0

        for p in projects:
            source_id = f"sgi_{p.get('id', '')}"
            nombre = p.get("nombre", "")
            budget = p.get("presupuesto")

            doc: dict = {
                "source_id": source_id,
                "source": "sgi",
                "title": nombre,
                "description": nombre,
                "client": p.get("cliente", ""),
                "sector": self._classify_sector(nombre),
                "presupuesto_original": budget,
                "certificado_total": p.get("certificado_total"),
                "estado_sgi": p.get("estado"),
                "sgi_id": p.get("id", ""),
                "cached_at": now,
            }

            # Apply IPC
            if budget:
                fecha = p.get("fechaInicio") or ""
                try:
                    year = int(fecha[:4]) if fecha and len(fecha) >= 4 else 2024
                    adj, coef = adjust_for_inflation(budget, year)
                    doc["presupuesto_actualizado"] = adj
                    doc["ipc_coeficiente"] = coef
                except (ValueError, TypeError):
                    pass

            await self.collection.update_one(
                {"source_id": source_id},
                {"$set": doc},
                upsert=True,
            )
            total += 1

        return total

    def _classify_sector(self, nombre: str) -> str:
        """Classify project into sector based on name keywords (SGI fallback only)."""
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
        return "Servicios IT"

    def _to_antecedente(self, doc: dict) -> dict:
        """Convert cached doc to API response format."""
        result: dict = {
            "id": str(doc.get("_id", "")),
            "title": doc.get("title", ""),
            "objeto": doc.get("description", ""),
            "organization": doc.get("client", ""),
            "budget": doc.get("presupuesto_original"),
            "budget_adjusted": doc.get("presupuesto_actualizado"),
            "ipc_coefficient": doc.get("ipc_coeficiente"),
            "publication_date": doc.get("fecha_proyecto", ""),
            "category": doc.get("sector", ""),
            "unidad_negocio": doc.get("unidad_negocio", ""),
            "image_url": doc.get("image_url", ""),
            "detail_url": doc.get("detail_url", ""),
            "source": doc.get("source", "website"),
            "url": doc.get("detail_url") or doc.get("url", ""),
            "certificado_total": doc.get("certificado_total"),
            "estado_sgi": doc.get("estado_sgi"),
            "fecha_inicio": doc.get("fecha_inicio", ""),
            "fecha_cierre": doc.get("fecha_cierre", ""),
            "sgi_id": doc.get("sgi_id", ""),
            "project_id": doc.get("project_id", ""),
        }
        return result


_instance = None


def get_um_antecedente_service(db):
    global _instance
    if _instance is None or _instance.db is not db:
        _instance = UMAntecedenteService(db)
    return _instance
