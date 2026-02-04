#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from pymongo import MongoClient

# Ensure backend package imports
import sys
from pathlib import Path as _Path
ROOT = _Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'backend'))

from models.scraper_config import ScraperConfig
from backend.scrapers.boletin_oficial_mendoza_scraper import BoletinOficialMendozaScraper


CONFIG_NAME = "Boletin Oficial Mendoza"
OUTPUT = Path('storage/boletin_mendoza_run.json')


async def main() -> int:
    client = MongoClient('mongodb://localhost:27017')
    db = client['licitometro']
    col = db['scraper_configs']
    raw = col.find_one({'name': CONFIG_NAME})
    if not raw:
        print('Config not found')
        return 1
    raw.pop('_id', None)
    config = ScraperConfig(**raw)

    scraper = BoletinOficialMendozaScraper(config)

    results = await scraper.run()
    payload = [r.model_dump(mode="json") for r in results]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {len(payload)} results to {OUTPUT}')
    return 0


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
