"""
Backfill opening_date for licitaciones that are missing it.

Strategy:
1. For COMPR.AR records: re-visit list page and match rows by licitacion_number
   to extract apertura date from the table.
2. For records with pliego URLs (from DB or cache): fetch and parse the pliego page.
3. For records with source URLs: attempt to fetch and extract dates.
4. Clean up junk records (no number, no description, no metadata).

Usage:
    python backend/scripts/backfill_opening_date.py [--dry-run] [--fuente "COMPR.AR Mendoza"] [--cleanup]
"""

import asyncio
import logging
import sys
import argparse
import json
from pathlib import Path
from datetime import datetime

# Add parent paths
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pymongo import MongoClient
from typing import Optional
from bson import ObjectId
from bs4 import BeautifulSoup
from utils.dates import parse_date_guess
import re
import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill_opening_date")

CACHE_PATH = Path(__file__).parent.parent / "storage" / "pliego_url_cache.json"


def load_pliego_cache() -> dict:
    """Load the pliego URL cache file."""
    if CACHE_PATH.exists():
        try:
            with open(CACHE_PATH) as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Could not load pliego cache: {e}")
    return {}


def extract_apertura_from_list_html(html: str) -> dict:
    """Extract {numero: apertura_date} map from COMPR.AR list page table."""
    soup = BeautifulSoup(html, 'html.parser')
    table = soup.find('table', {'id': re.compile('GridListaPliegosAperturaProxima')})
    results = {}
    if not table:
        return results
    for row in table.find_all('tr'):
        cols = row.find_all('td')
        if len(cols) < 4:
            continue
        numero = cols[0].get_text(' ', strip=True)
        apertura_raw = cols[3].get_text(' ', strip=True)
        if numero and apertura_raw:
            parsed = parse_date_guess(apertura_raw)
            if parsed:
                results[numero] = parsed
            else:
                logger.warning(f"  Could not parse apertura '{apertura_raw}' for {numero}")
    return results


def extract_apertura_from_pliego_html(html: str) -> Optional[datetime]:
    """Extract opening_date from a PLIEGO detail page."""
    soup = BeautifulSoup(html, 'html.parser')

    # Strategy 1: Look for labeled fields
    for lab in soup.find_all('label'):
        text = lab.get_text(' ', strip=True)
        if any(t.lower() in text.lower() for t in [
            "Fecha y hora acto de apertura",
            "Fecha de Apertura",
            "Fecha de apertura",
            "Fecha y Hora de Apertura",
        ]):
            nxt = lab.find_next_sibling()
            if nxt:
                raw = nxt.get_text(' ', strip=True)
                parsed = parse_date_guess(raw)
                if parsed:
                    return parsed
                else:
                    logger.warning(f"  Found label '{text}' with value '{raw}' but could not parse")

    # Strategy 2: Look in cronograma table
    for table in soup.find_all('table'):
        for row in table.find_all('tr'):
            cells = row.find_all('td')
            if len(cells) >= 2:
                label_text = cells[0].get_text(' ', strip=True).lower()
                if 'apertura' in label_text:
                    raw = cells[1].get_text(' ', strip=True)
                    parsed = parse_date_guess(raw)
                    if parsed:
                        return parsed

    # Strategy 3: Look for any span/div with apertura-like content
    for elem in soup.find_all(['span', 'div', 'td', 'p']):
        text = elem.get_text(' ', strip=True)
        if re.search(r'apertura.*\d{2}[/\-]\d{2}[/\-]\d{4}', text, re.IGNORECASE):
            # Extract the date part
            match = re.search(r'(\d{2}[/\-]\d{2}[/\-]\d{4}(?:\s+\d{2}:\d{2})?)', text)
            if match:
                parsed = parse_date_guess(match.group(1))
                if parsed:
                    return parsed

    return None


async def backfill_from_comprar_lists(db, dry_run=False):
    """Re-visit COMPR.AR list pages and extract apertura dates."""
    col = db['licitaciones']

    # Get all unique list URLs from COMPR.AR records
    pipeline = [
        {"$match": {"fuente": "COMPR.AR Mendoza", "opening_date": None}},
        {"$group": {"_id": "$metadata.comprar_list_url"}},
    ]
    list_urls = [r["_id"] for r in col.aggregate(pipeline) if r["_id"]]
    logger.info(f"Found {len(list_urls)} unique COMPR.AR list URLs to re-visit")

    updated = 0
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for list_url in list_urls:
            logger.info(f"Fetching list: {list_url}")
            try:
                resp = await client.get(list_url)
                if resp.status_code != 200:
                    logger.warning(f"  HTTP {resp.status_code} for {list_url}")
                    continue
                apertura_map = extract_apertura_from_list_html(resp.text)
                logger.info(f"  Extracted {len(apertura_map)} apertura dates from list")

                for numero, opening_date in apertura_map.items():
                    # Find matching record
                    doc = col.find_one({
                        "licitacion_number": numero,
                        "opening_date": None
                    })
                    if doc:
                        if dry_run:
                            logger.info(f"  [DRY-RUN] Would set opening_date={opening_date} for {numero}")
                        else:
                            col.update_one(
                                {"_id": doc["_id"]},
                                {"$set": {
                                    "opening_date": opening_date,
                                    "updated_at": datetime.utcnow()
                                }}
                            )
                            logger.info(f"  Updated opening_date={opening_date} for {numero}")
                        updated += 1
            except Exception as e:
                logger.error(f"  Error fetching {list_url}: {e}")
                continue

    return updated


async def backfill_from_pliego_urls(db, dry_run=False):
    """For records with pliego URLs (from DB or cache), fetch and extract opening_date."""
    col = db['licitaciones']
    cache = load_pliego_cache()

    # Find all COMPR.AR records missing opening_date
    docs = list(col.find({
        "opening_date": None,
        "fuente": "COMPR.AR Mendoza",
        "licitacion_number": {"$ne": None}
    }))
    logger.info(f"Found {len(docs)} COMPR.AR records to check for pliego URLs")
    logger.info(f"Pliego URL cache has {len(cache)} entries")

    updated = 0
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for doc in docs:
            numero = doc.get("licitacion_number")

            # Try DB metadata first, then cache
            pliego_url = doc.get("metadata", {}).get("comprar_pliego_url")
            if not pliego_url and numero and numero in cache:
                pliego_url = cache[numero].get("url")
                logger.info(f"  Found pliego URL for {numero} in cache")

            if not pliego_url:
                continue

            try:
                resp = await client.get(pliego_url)
                if resp.status_code != 200:
                    logger.warning(f"  HTTP {resp.status_code} for pliego of {numero}")
                    continue
                opening_date = extract_apertura_from_pliego_html(resp.text)
                if opening_date:
                    if dry_run:
                        logger.info(f"  [DRY-RUN] Would set opening_date={opening_date} for {numero}")
                    else:
                        # Also update pliego_url in metadata if it came from cache
                        update_fields = {
                            "opening_date": opening_date,
                            "updated_at": datetime.utcnow()
                        }
                        if not doc.get("metadata", {}).get("comprar_pliego_url"):
                            update_fields["metadata.comprar_pliego_url"] = pliego_url
                        col.update_one(
                            {"_id": doc["_id"]},
                            {"$set": update_fields}
                        )
                        logger.info(f"  Updated opening_date={opening_date} for {numero}")
                    updated += 1
                else:
                    logger.warning(f"  Could not extract apertura from pliego page for {numero}")
            except Exception as e:
                logger.error(f"  Error fetching pliego for {numero}: {e}")
                continue

    return updated


async def backfill_from_source_urls(db, fuente: Optional[str], dry_run=False):
    """For non-COMPR.AR records, try fetching source page and extracting date."""
    col = db['licitaciones']

    query = {"opening_date": None}
    if fuente:
        query["fuente"] = fuente
    else:
        # Skip COMPR.AR (handled separately) and Boletin Oficial (government decrees)
        query["fuente"] = {"$nin": ["COMPR.AR Mendoza", "Boletin Oficial Mendoza (PDF)", "Boletin Oficial Mendoza"]}

    docs = list(col.find(query))
    logger.info(f"Found {len(docs)} non-COMPR.AR records without opening_date")

    updated = 0
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for doc in docs:
            source_url = doc.get("source_url")
            if not source_url or not source_url.startswith("http"):
                continue
            try:
                resp = await client.get(source_url)
                if resp.status_code != 200:
                    continue
                # Try generic apertura extraction
                opening_date = extract_apertura_from_pliego_html(resp.text)
                if not opening_date:
                    # Try alternate: look for "apertura" in any table
                    soup = BeautifulSoup(resp.text, 'html.parser')
                    for key_cell in soup.find_all(['td', 'th', 'dt', 'label', 'strong']):
                        text = key_cell.get_text(' ', strip=True).lower()
                        if 'apertura' in text or 'fecha de apertura' in text:
                            val_cell = key_cell.find_next_sibling()
                            if val_cell:
                                raw = val_cell.get_text(' ', strip=True)
                                opening_date = parse_date_guess(raw)
                                if opening_date:
                                    break
                if opening_date:
                    if dry_run:
                        logger.info(f"  [DRY-RUN] Would set opening_date={opening_date} for {doc.get('title', '')[:50]}")
                    else:
                        col.update_one(
                            {"_id": doc["_id"]},
                            {"$set": {
                                "opening_date": opening_date,
                                "updated_at": datetime.utcnow()
                            }}
                        )
                        logger.info(f"  Updated opening_date for {doc.get('title', '')[:50]}")
                    updated += 1
            except Exception as e:
                logger.error(f"  Error: {e}")
                continue

    return updated


def cleanup_junk_records(db, dry_run=False):
    """Remove junk records that have no useful data."""
    col = db['licitaciones']

    # Find records with no licitacion_number, no description, generic title
    junk_query = {
        "licitacion_number": None,
        "$or": [
            {"title": "Proceso de compra"},
            {"title": None},
            {"title": ""},
        ],
        "description": None,
    }
    junk = list(col.find(junk_query, {"_id": 1, "title": 1, "fuente": 1}))
    logger.info(f"Found {len(junk)} junk records to clean up")

    if dry_run:
        for d in junk:
            logger.info(f"  [DRY-RUN] Would delete junk: {d['_id']} ({d.get('title')})")
        return len(junk)

    if junk:
        ids = [d["_id"] for d in junk]
        result = col.delete_many({"_id": {"$in": ids}})
        logger.info(f"  Deleted {result.deleted_count} junk records")
        return result.deleted_count

    return 0


async def main():
    parser = argparse.ArgumentParser(description="Backfill opening_date for licitaciones")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually update, just log")
    parser.add_argument("--fuente", type=str, help="Only process specific fuente")
    parser.add_argument("--cleanup", action="store_true", help="Also cleanup junk records")
    args = parser.parse_args()

    client = MongoClient("localhost", 27017)
    db = client["licitometro"]
    col = db["licitaciones"]

    total = col.count_documents({})
    missing = col.count_documents({"opening_date": None})
    has_date = col.count_documents({"opening_date": {"$ne": None}})
    logger.info(f"Total licitaciones: {total}, with opening_date: {has_date}, missing: {missing} ({missing/total*100:.0f}%)")

    if args.dry_run:
        logger.info("=== DRY RUN MODE ===")

    total_updated = 0

    # Step 0: Cleanup junk records
    if args.cleanup:
        logger.info("\n=== Step 0: Cleanup junk records ===")
        cleaned = cleanup_junk_records(db, dry_run=args.dry_run)
        logger.info(f"Cleaned up {cleaned} junk records")

    # Step 1: COMPR.AR list pages
    if not args.fuente or args.fuente == "COMPR.AR Mendoza":
        logger.info("\n=== Step 1: COMPR.AR list pages ===")
        u = await backfill_from_comprar_lists(db, dry_run=args.dry_run)
        total_updated += u
        logger.info(f"COMPR.AR list pages: {u} records updated")

    # Step 2: Pliego URLs (DB + cache)
    if not args.fuente or args.fuente == "COMPR.AR Mendoza":
        logger.info("\n=== Step 2: Pliego URLs (DB + cache) ===")
        u = await backfill_from_pliego_urls(db, dry_run=args.dry_run)
        total_updated += u
        logger.info(f"Pliego URLs: {u} records updated")

    # Step 3: Other source URLs
    logger.info("\n=== Step 3: Source URLs (other scrapers) ===")
    u = await backfill_from_source_urls(db, fuente=args.fuente, dry_run=args.dry_run)
    total_updated += u
    logger.info(f"Source URLs: {u} records updated")

    # Final report
    still_missing = col.count_documents({"opening_date": None})
    still_total = col.count_documents({})
    boe_missing = col.count_documents({"opening_date": None, "fuente": "Boletin Oficial Mendoza"})
    compr_missing = col.count_documents({"opening_date": None, "fuente": "COMPR.AR Mendoza"})

    logger.info(f"\n=== DONE ===")
    logger.info(f"Total updated this run: {total_updated}")
    logger.info(f"Still missing opening_date: {still_missing} / {still_total}")
    logger.info(f"  - COMPR.AR Mendoza: {compr_missing}")
    logger.info(f"  - Boletin Oficial (decrees, no apertura expected): {boe_missing}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
