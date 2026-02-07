"""
Local Scraper Bridge - Run from Argentine residential IP for blocked sources.

This script runs on YOUR local machine (not the VPS) to scrape sites that
block datacenter IPs. Results are pushed to the production API.

Usage:
  # Scrape all blocked sources
  python3 backend/scripts/local_scraper_bridge.py

  # Scrape specific source
  python3 backend/scripts/local_scraper_bridge.py --source "San Carlos"

  # Dry run (don't push to server)
  python3 backend/scripts/local_scraper_bridge.py --dry-run

  # Custom server URL
  python3 backend/scripts/local_scraper_bridge.py --server https://licitometro.ar

Requirements (install locally):
  pip install aiohttp beautifulsoup4 lxml
"""

import asyncio
import aiohttp
import argparse
import hashlib
import json
import logging
import re
import sys
from datetime import datetime
from typing import List, Dict, Optional, Any
from bs4 import BeautifulSoup

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("local-bridge")

# Production server
DEFAULT_SERVER = "https://licitometro.ar"

# Spanish months for date parsing
SPANISH_MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
    "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}

# Sources that need local scraping (blocked from datacenter IPs)
BLOCKED_SOURCES = [
    {
        "name": "San Carlos",
        "organization": "Municipalidad de San Carlos",
        "url": "https://sancarlos.gob.ar/licitaciones-msc/",
        "pages": [
            "https://sancarlos.gob.ar/licitaciones-msc/",
            "https://sancarlos.gob.ar/licitaciones-msc/page/2/",
            "https://sancarlos.gob.ar/licitaciones-msc/page/3/",
        ],
        "selectors": {
            "list_item": "article.elementor-post, .jet-listing-grid__item, article",
            "title": "h2 a, h3 a, .elementor-post__title a, .jet-listing-dynamic-link a",
            "date": "time, .elementor-post-date, .jet-listing-dynamic-field time",
            "link": "h2 a, h3 a, .elementor-post__title a",
            "description": ".elementor-post__excerpt, .jet-listing-dynamic-field p, p",
        },
        "id_prefix": "sancarlos-",
        "tipo_procedimiento": "Licitacion Publica",
    },
    {
        "name": "La Paz",
        "organization": "Municipalidad de La Paz",
        "url": "https://lapazmendoza.gob.ar/licitaciones/",
        "pages": ["https://lapazmendoza.gob.ar/licitaciones/"],
        "selectors": {
            "list_item": "article, .post, tr, .entry",
            "title": "h2 a, h3 a, .entry-title a, td:nth-child(2)",
            "date": "time, .entry-date, td:nth-child(1)",
            "link": "h2 a, h3 a, .entry-title a",
            "description": ".entry-content, .excerpt, p",
        },
        "id_prefix": "lapaz-",
        "tipo_procedimiento": "Licitacion Publica",
    },
]

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"


def parse_date_local(text: str) -> Optional[datetime]:
    """Parse Spanish date strings into datetime objects."""
    if not text:
        return None

    text = text.strip()
    # Strip common suffixes
    for suffix in ["Hrs.", "Hs.", "horas", "hrs", "hs"]:
        text = text.replace(suffix, "").strip()

    # Replace Spanish months
    text_lower = text.lower()
    for month_es, month_num in SPANISH_MONTHS.items():
        if month_es in text_lower:
            text_lower = text_lower.replace(f" de {month_es} de ", f"/{month_num}/")
            text_lower = text_lower.replace(f" de {month_es} del ", f"/{month_num}/")
            text_lower = text_lower.replace(month_es, str(month_num))
            text = text_lower
            break

    # Try common formats
    formats = [
        "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d",
        "%d/%m/%Y %H:%M", "%d-%m-%Y %H:%M", "%Y-%m-%dT%H:%M",
        "%d/%m/%y", "%d %m %Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(text.strip(), fmt)
        except ValueError:
            continue

    # Try ISO from datetime attribute
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00").split("+")[0])
    except (ValueError, AttributeError):
        pass

    return None


def make_content_hash(title: str, fuente: str, date: Optional[datetime]) -> str:
    """Generate dedup hash matching backend logic."""
    date_str = date.strftime("%Y%m%d") if date else "nodate"
    raw = f"{title.lower().strip()}|{fuente}|{date_str}"
    return hashlib.md5(raw.encode()).hexdigest()


def make_id(url: str, title: str, prefix: str) -> str:
    """Generate unique ID for a licitacion."""
    raw = f"{url}|{title}"
    return prefix + hashlib.md5(raw.encode()).hexdigest()[:12]


async def scrape_source(session: aiohttp.ClientSession, source: Dict) -> List[Dict]:
    """Scrape a single blocked source and return licitacion dicts."""
    items = []
    seen_hashes = set()
    name = source["name"]

    for page_url in source["pages"]:
        logger.info(f"[{name}] Fetching {page_url}")
        try:
            async with session.get(page_url, ssl=False) as resp:
                if resp.status != 200:
                    logger.warning(f"[{name}] {page_url} returned {resp.status}")
                    continue
                html = await resp.text(errors="replace")
        except Exception as e:
            logger.error(f"[{name}] Error fetching {page_url}: {e}")
            continue

        soup = BeautifulSoup(html, "lxml")
        sel = source["selectors"]

        # Find list items
        elements = soup.select(sel["list_item"])
        logger.info(f"[{name}] Found {len(elements)} items on {page_url}")

        for el in elements:
            # Extract title
            title_el = el.select_one(sel["title"])
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            if not title or len(title) < 5:
                continue

            # Extract link
            link = None
            link_el = el.select_one(sel["link"])
            if link_el and link_el.get("href"):
                link = link_el["href"]
                if link.startswith("/"):
                    from urllib.parse import urljoin
                    link = urljoin(source["url"], link)

            # Extract date
            pub_date = None
            date_el = el.select_one(sel["date"])
            if date_el:
                # Try datetime attribute first (e.g. <time datetime="2026-01-15">)
                dt_attr = date_el.get("datetime")
                if dt_attr:
                    pub_date = parse_date_local(dt_attr)
                if not pub_date:
                    pub_date = parse_date_local(date_el.get_text(strip=True))

            # Extract description
            desc = None
            desc_el = el.select_one(sel["description"])
            if desc_el:
                desc = desc_el.get_text(strip=True)[:500]

            # Dedup
            content_hash = make_content_hash(title, name, pub_date)
            if content_hash in seen_hashes:
                continue
            seen_hashes.add(content_hash)

            item = {
                "id_licitacion": make_id(link or page_url, title, source["id_prefix"]),
                "title": title,
                "organization": source["organization"],
                "publication_date": pub_date.isoformat() if pub_date else datetime.now().isoformat(),
                "jurisdiccion": "Mendoza",
                "tipo_procedimiento": source["tipo_procedimiento"],
                "fuente": name,
                "source_url": link,
                "description": desc,
                "fecha_scraping": datetime.now().isoformat(),
                "content_hash": content_hash,
                "status": "active",
                "workflow_state": "descubierta",
                "enrichment_level": 1,
                "metadata": {"scraped_by": "local_bridge", "page_url": page_url},
            }
            items.append(item)

        await asyncio.sleep(1)  # Be polite between pages

    logger.info(f"[{name}] Total unique items: {len(items)}")
    return items


async def login_to_server(session: aiohttp.ClientSession, server: str, password: str) -> bool:
    """Authenticate with the production server."""
    url = f"{server}/api/auth/login"
    try:
        async with session.post(url, json={"password": password}, ssl=False) as resp:
            if resp.status == 200:
                logger.info("Authenticated with server")
                return True
            else:
                body = await resp.text()
                logger.error(f"Auth failed ({resp.status}): {body}")
                return False
    except Exception as e:
        logger.error(f"Auth error: {e}")
        return False


async def push_items(session: aiohttp.ClientSession, server: str, items: List[Dict]) -> Dict:
    """Push scraped items to the production API."""
    url = f"{server}/api/licitaciones/"
    created = 0
    skipped = 0
    errors = 0

    for item in items:
        try:
            async with session.post(url, json=item, ssl=False) as resp:
                if resp.status in (200, 201):
                    created += 1
                elif resp.status == 409:  # Duplicate
                    skipped += 1
                else:
                    body = await resp.text()
                    logger.warning(f"Push failed ({resp.status}): {body[:200]}")
                    errors += 1
        except Exception as e:
            logger.error(f"Push error: {e}")
            errors += 1

        await asyncio.sleep(0.1)  # Don't overwhelm the API

    return {"created": created, "skipped": skipped, "errors": errors}


async def main():
    parser = argparse.ArgumentParser(description="Local Scraper Bridge for blocked sources")
    parser.add_argument("--source", "-s", help="Scrape only this source name")
    parser.add_argument("--server", default=DEFAULT_SERVER, help=f"Server URL (default: {DEFAULT_SERVER})")
    parser.add_argument("--password", "-p", help="Server password (or set LICITOMETRO_PASSWORD env)")
    parser.add_argument("--dry-run", action="store_true", help="Scrape but don't push to server")
    parser.add_argument("--output", "-o", help="Save scraped items to JSON file")
    args = parser.parse_args()

    sources = BLOCKED_SOURCES
    if args.source:
        sources = [s for s in BLOCKED_SOURCES if s["name"].lower() == args.source.lower()]
        if not sources:
            print(f"Source '{args.source}' not found. Available: {', '.join(s['name'] for s in BLOCKED_SOURCES)}")
            sys.exit(1)

    timeout = aiohttp.ClientTimeout(total=30, connect=15)
    headers = {"User-Agent": UA}
    jar = aiohttp.CookieJar()

    async with aiohttp.ClientSession(timeout=timeout, headers=headers, cookie_jar=jar) as session:
        # Scrape all sources
        all_items = []
        for source in sources:
            items = await scrape_source(session, source)
            all_items.extend(items)

        print(f"\n{'='*60}")
        print(f"SCRAPING COMPLETE: {len(all_items)} items from {len(sources)} sources")
        print(f"{'='*60}")

        # Save to file if requested
        if args.output:
            with open(args.output, "w") as f:
                json.dump(all_items, f, indent=2, ensure_ascii=False)
            print(f"Saved to {args.output}")

        if args.dry_run:
            print("\n[DRY RUN] Not pushing to server.")
            for item in all_items[:5]:
                print(f"  - {item['title'][:80]} ({item['publication_date'][:10]})")
            if len(all_items) > 5:
                print(f"  ... and {len(all_items) - 5} more")
            return

        # Push to server
        password = args.password or __import__("os").environ.get("LICITOMETRO_PASSWORD")
        if not password:
            password = input("Server password: ").strip()
            if not password:
                print("No password provided. Use --password or LICITOMETRO_PASSWORD env var.")
                sys.exit(1)

        if not await login_to_server(session, args.server, password):
            print("Failed to authenticate. Aborting push.")
            sys.exit(1)

        result = await push_items(session, args.server, all_items)
        print(f"\nPush results: {result['created']} created, {result['skipped']} skipped, {result['errors']} errors")


if __name__ == "__main__":
    asyncio.run(main())
