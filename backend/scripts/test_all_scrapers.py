#!/usr/bin/env python3
"""
Test integral de scrapers de Mendoza.

Ejecuta CADA scraper activo de Mendoza (dry-run, sin guardar a BD) y reporta:
- Cuales retornan items y cuantos
- Cuales fallan y por que
- Cuales retornan 0 items (sospechoso si antes retornaban muchos)
- Tiempo de ejecucion de cada uno

Uso:
  # Todos los scrapers de Mendoza
  python3 scripts/test_all_scrapers.py

  # Un scraper especifico
  python3 scripts/test_all_scrapers.py --scraper "ComprasApps Mendoza"

  # Incluir scrapers nacionales tambien
  python3 scripts/test_all_scrapers.py --all

  # Timeout personalizado (segundos)
  python3 scripts/test_all_scrapers.py --timeout 600
"""

import asyncio
import argparse
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from models.scraper_config import ScraperConfig
from scrapers.scraper_factory import create_scraper

logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("test_scrapers")

# ANSI colors
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"


async def test_scraper(config_data: dict, timeout: int) -> dict:
    """Test a single scraper. Returns result dict."""
    name = config_data["name"]

    # Build ScraperConfig (strip MongoDB _id)
    clean = {k: v for k, v in config_data.items() if k != "_id"}
    try:
        config = ScraperConfig(**clean)
    except Exception as e:
        return {
            "name": name,
            "status": "FAILED",
            "items": 0,
            "last_items_found": config_data.get("last_items_found", 0),
            "duration": 0,
            "sample": None,
            "error": f"Config parse error: {e}"[:200],
        }

    scraper = create_scraper(config)
    if not scraper:
        return {
            "name": name,
            "status": "FAILED",
            "items": 0,
            "last_items_found": config_data.get("last_items_found", 0),
            "duration": 0,
            "sample": None,
            "error": "No scraper matched by factory",
        }

    start = time.time()
    try:
        items = await asyncio.wait_for(scraper.run(), timeout=timeout)
        duration = time.time() - start

        last_items = config_data.get("last_items_found", 0)
        if len(items) == 0 and last_items > 10:
            status = "SUSPICIOUS"
        elif len(items) == 0:
            status = "EMPTY"
        else:
            status = "OK"

        sample = None
        if items:
            title = items[0].title or ""
            sample = title[:60]

        return {
            "name": name,
            "status": status,
            "items": len(items),
            "last_items_found": last_items,
            "duration": duration,
            "sample": sample,
            "error": None,
        }
    except asyncio.TimeoutError:
        return {
            "name": name,
            "status": "FAILED",
            "items": 0,
            "last_items_found": config_data.get("last_items_found", 0),
            "duration": time.time() - start,
            "sample": None,
            "error": f"TimeoutError: exceeded {timeout}s",
        }
    except Exception as e:
        return {
            "name": name,
            "status": "FAILED",
            "items": 0,
            "last_items_found": config_data.get("last_items_found", 0),
            "duration": time.time() - start,
            "sample": None,
            "error": str(e)[:200],
        }


def print_report(results: list, total_duration: float):
    """Print formatted report table."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    total = len(results)

    print(f"\n{BOLD}=== TEST INTEGRAL DE SCRAPERS ==={RESET}")
    print(f"Fecha: {now}")
    print(f"Configs: {total} testeadas\n")

    # Table header
    header = f"{'#':>2} | {'Scraper':<30} | {'Status':<11} | {'Items':>5} | {'Esperado':>8} | {'Tiempo':>7} | Detalle"
    sep = "-" * len(header)
    print(header)
    print(sep)

    for i, r in enumerate(results, 1):
        status = r["status"]
        if status == "OK":
            color = GREEN
        elif status == "EMPTY":
            color = YELLOW
        else:
            color = RED

        expected = f"~{r['last_items_found']}" if r["last_items_found"] else "?"
        dur = f"{r['duration']:.1f}s"

        detail = ""
        if r["error"]:
            detail = r["error"][:60]
        elif r["sample"]:
            detail = r["sample"]
        elif status == "EMPTY":
            detail = "(sin items)"

        print(
            f"{i:>2} | {r['name']:<30} | "
            f"{color}{status:<11}{RESET} | "
            f"{r['items']:>5} | {expected:>8} | {dur:>7} | {detail}"
        )

    # Summary
    ok = sum(1 for r in results if r["status"] == "OK")
    empty = sum(1 for r in results if r["status"] == "EMPTY")
    suspicious = sum(1 for r in results if r["status"] == "SUSPICIOUS")
    failed = sum(1 for r in results if r["status"] == "FAILED")

    mins = int(total_duration // 60)
    secs = int(total_duration % 60)

    print(f"\n{BOLD}=== RESUMEN ==={RESET}")
    print(f"{GREEN}OK:         {ok}/{total} scrapers{RESET}")
    if empty:
        print(f"{YELLOW}EMPTY:      {empty}/{total} (items=0, esperado pocos){RESET}")
    if suspicious:
        print(f"{RED}SUSPICIOUS: {suspicious}/{total} (items=0, ESPERABA >10 — REVISAR){RESET}")
    if failed:
        print(f"{RED}FAILED:     {failed}/{total} (excepcion){RESET}")
    print(f"Duracion total: {mins}m {secs}s")

    # List suspicious/failed for quick action
    problems = [r for r in results if r["status"] in ("SUSPICIOUS", "FAILED")]
    if problems:
        print(f"\n{RED}{BOLD}--- PROBLEMAS ---{RESET}")
        for r in problems:
            print(f"  {r['status']}: {r['name']}")
            if r["error"]:
                print(f"    {DIM}{r['error']}{RESET}")


async def main():
    parser = argparse.ArgumentParser(description="Test integral de scrapers")
    parser.add_argument(
        "--scraper",
        type=str,
        default=None,
        help="Testear solo un scraper por nombre (e.g. 'ComprasApps Mendoza')",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Incluir scrapers nacionales (por defecto solo Mendoza)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=300,
        help="Timeout por scraper en segundos (default: 300)",
    )
    args = parser.parse_args()

    # Connect to MongoDB
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)

    try:
        await client.server_info()
    except Exception as e:
        print(f"{RED}Error conectando a MongoDB: {e}{RESET}")
        sys.exit(1)

    db = client[db_name]

    # Load configs
    query = {"active": True}
    if not args.all:
        query["$or"] = [{"scope": None}, {"scope": {"$exists": False}}, {"scope": {"$ne": "ar_nacional"}}]
    if args.scraper:
        query["name"] = {"$regex": args.scraper, "$options": "i"}

    configs = await db.scraper_configs.find(query).sort("name", 1).to_list(length=100)

    if not configs:
        print(f"{YELLOW}No se encontraron configs activas matching query.{RESET}")
        client.close()
        sys.exit(0)

    print(f"\n{BOLD}Encontradas {len(configs)} configs activas.{RESET}")
    print(f"Timeout por scraper: {args.timeout}s\n")

    # Run each scraper sequentially
    results = []
    total_start = time.time()

    for i, config_data in enumerate(configs, 1):
        name = config_data.get("name", "?")
        print(f"[{i}/{len(configs)}] Testeando: {name}...", end=" ", flush=True)

        result = await test_scraper(config_data, args.timeout)
        results.append(result)

        # Inline status
        status = result["status"]
        if status == "OK":
            print(f"{GREEN}{status}{RESET} ({result['items']} items, {result['duration']:.1f}s)")
        elif status == "EMPTY":
            print(f"{YELLOW}{status}{RESET} (0 items, {result['duration']:.1f}s)")
        else:
            print(f"{RED}{status}{RESET} ({result.get('error', '')[:80]})")

    total_duration = time.time() - total_start

    # Print final report
    print_report(results, total_duration)

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
