"""
Fix ComprasApps Mendoza timeout: update performance-critical config fields in DB.

Root cause:
- DB config had max_pages=200 and wait_time=1.5 set by update_comprasapps_config.py
- With 4 year/estado combos × 200 pages × 20s/request = 16,000s worst case
- The scheduler kills the task after 1200s → "Scraper timed out after 1200s"

Fix:
- max_pages: 200 → 50   (500 rows max per combo; dedup catches the rest)
- wait_time: 1.5 → 0.5  (faster polling; GeneXus can handle it)
- The scraper code also has a 900s internal time budget guard as safety net

Run on production:
    docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \
        python3 scripts/fix_comprasapps_timeout.py
"""

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    result = await db.scraper_configs.find_one({
        "$or": [
            {"name": {"$regex": "ComprasApps", "$options": "i"}},
            {"url": {"$regex": "comprasapps", "$options": "i"}},
        ]
    })

    if not result:
        print("ERROR: ComprasApps Mendoza config not found in DB")
        return

    old_max_pages = result.get("selectors", {}).get("max_pages", "?")
    old_wait_time = result.get("wait_time", "?")

    await db.scraper_configs.update_one(
        {"_id": result["_id"]},
        {"$set": {
            "wait_time": 0.5,
            "selectors.max_pages": 50,
            "updated_at": datetime.utcnow(),
        }}
    )

    updated = await db.scraper_configs.find_one({"_id": result["_id"]})
    new_max_pages = updated.get("selectors", {}).get("max_pages", "?")
    new_wait_time = updated.get("wait_time", "?")

    print(f"Updated '{result['name']}':")
    print(f"  max_pages : {old_max_pages} → {new_max_pages}")
    print(f"  wait_time : {old_wait_time} → {new_wait_time}")
    print("Done. Scraper should now complete within the 1200s scheduler timeout.")


asyncio.run(main())
