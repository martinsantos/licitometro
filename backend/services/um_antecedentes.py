"""Ultima Milla S.A. — Antecedentes scraper + MongoDB cache.

Scrapes ultimamilla.com.ar/antecedentes (server-rendered HTML, paginated).
Caches results in MongoDB collection `um_antecedentes` with 24h TTL refresh.
"""

import asyncio
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import aiohttp
from bs4 import BeautifulSoup

logger = logging.getLogger("um_antecedentes")

BASE_URL = "https://ultimamilla.com.ar/antecedentes"
CACHE_TTL_HOURS = 24
MAX_PAGES = 30
PAGE_DELAY = 0.5  # seconds between page fetches


class UMAntecedenteService:
    """Scrapes and caches Ultima Milla antecedentes."""

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
        # Check if cache needs refresh
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
                # Continue with stale cache

        # Build query
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
        except Exception as e:
            logger.warning(f"Text search failed, falling back: {e}")
            # Fallback: no text search
            fallback_q = {}
            if sector:
                fallback_q["sector"] = {"$regex": re.escape(sector), "$options": "i"}
            docs = await self.collection.find(fallback_q).sort("cached_at", -1).limit(limit).to_list(limit)

        return [self._to_antecedente(d) for d in docs]

    async def _refresh_cache(self):
        """Scrape all pages from ultimamilla.com.ar/antecedentes."""
        logger.info("Refreshing UM antecedentes cache...")
        now = datetime.now(timezone.utc)
        total_scraped = 0

        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30),
            connector=aiohttp.TCPConnector(ssl=False),
        ) as session:
            for page in range(1, MAX_PAGES + 1):
                url = f"{BASE_URL}?page={page}"
                try:
                    async with session.get(url) as resp:
                        if resp.status != 200:
                            logger.info(f"Page {page} returned {resp.status}, stopping")
                            break
                        html = await resp.text()
                except Exception as e:
                    logger.warning(f"Failed to fetch page {page}: {e}")
                    break

                soup = BeautifulSoup(html, "html.parser")
                items = self._parse_list_page(soup)
                if not items:
                    break

                for item in items:
                    item["cached_at"] = now
                    await self.collection.update_one(
                        {"source_id": item["source_id"]},
                        {"$set": item},
                        upsert=True,
                    )
                    total_scraped += 1

                # Check if there's a next page
                next_link = soup.select_one('a[rel="next"], a.next, li.next a, a:contains("Siguiente")')
                if not next_link:
                    # Also check if we got fewer items than expected
                    if len(items) < 10:
                        break

                await asyncio.sleep(PAGE_DELAY)

        logger.info(f"UM antecedentes cache refreshed: {total_scraped} items")

    def _parse_list_page(self, soup: BeautifulSoup) -> List[dict]:
        """Parse project cards from the antecedentes list page."""
        items = []

        # Try common card patterns
        cards = soup.select(
            "div.project-card, div.antecedente, article.project, "
            "div.card, div.col-md-4, div.portfolio-item, "
            "div.project-item, div.work-item"
        )

        if not cards:
            # Fallback: look for any repeated structure with links
            cards = soup.select("a[href*='/antecedentes/']")
            if cards:
                # Deduplicate parent containers
                seen = set()
                unique_cards = []
                for a in cards:
                    parent = a.parent
                    if parent and id(parent) not in seen:
                        seen.add(id(parent))
                        unique_cards.append(parent)
                cards = unique_cards

        for card in cards:
            try:
                item = self._parse_card(card)
                if item and item.get("title"):
                    items.append(item)
            except Exception:
                continue

        return items

    def _parse_card(self, card) -> Optional[dict]:
        """Extract data from a single project card."""
        # Find link
        link = card.select_one("a[href*='/antecedentes/']") or card.find("a", href=True)
        if not link:
            # Card itself might be a link
            if card.name == "a" and card.get("href"):
                link = card
            else:
                return None

        href = link.get("href", "")
        if not href.startswith("http"):
            href = f"https://ultimamilla.com.ar{href}"

        # Extract source_id from URL
        parts = href.rstrip("/").split("/")
        source_id = parts[-1] if parts else href

        # Title
        title_el = card.select_one("h2, h3, h4, .title, .project-title, .card-title")
        if not title_el:
            title_el = link
        title = (title_el.get_text(strip=True) if title_el else "").strip()

        # Description
        desc_el = card.select_one("p, .description, .excerpt, .card-text")
        description = (desc_el.get_text(strip=True) if desc_el else "").strip()

        # Category/sector
        cat_el = card.select_one(
            ".category, .sector, .tag, .badge, "
            "span.label, .project-category"
        )
        sector = (cat_el.get_text(strip=True) if cat_el else "").strip()

        # Client
        client_el = card.select_one(".client, .empresa, .company")
        client = (client_el.get_text(strip=True) if client_el else "").strip()

        # Image
        img = card.select_one("img")
        image_url = img.get("src", "") if img else ""

        if not title:
            return None

        return {
            "source_id": source_id,
            "title": title,
            "description": description,
            "sector": sector,
            "client": client,
            "url": href,
            "image_url": image_url,
        }

    def _to_antecedente(self, doc: dict) -> dict:
        """Convert cached doc to API response format."""
        return {
            "id": str(doc.get("_id", "")),
            "title": doc.get("title", ""),
            "objeto": doc.get("description", ""),
            "organization": doc.get("client", ""),
            "budget": None,
            "publication_date": "",
            "category": doc.get("sector", ""),
            "source": "ultimamilla.com.ar",
            "url": doc.get("url", ""),
        }


_instance = None


def get_um_antecedente_service(db):
    global _instance
    if _instance is None or _instance.db is not db:
        _instance = UMAntecedenteService(db)
    return _instance
