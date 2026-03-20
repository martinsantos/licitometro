"""Analyze COMPR.AR Mendoza data to understand enrichment failures."""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    total = await db.licitaciones.count_documents({"fuente": "COMPR.AR Mendoza"})
    enr1 = await db.licitaciones.count_documents({"fuente": "COMPR.AR Mendoza", "enrichment_level": 1})
    enr2 = await db.licitaciones.count_documents({"fuente": "COMPR.AR Mendoza", "enrichment_level": {"$gte": 2}})

    print(f"Total COMPR.AR: {total}")
    print(f"Enrichment 1 (basic): {enr1}")
    print(f"Enrichment 2+ (enriched): {enr2}")

    # Count by URL type
    electronicas = 0
    pliego = 0
    other = 0
    empty_fields = 0
    has_fields = 0

    cursor = db.licitaciones.find(
        {"fuente": "COMPR.AR Mendoza"},
        {"source_url": 1, "metadata": 1, "enrichment_level": 1, "licitacion_number": 1, "budget": 1, "description": 1, "title": 1}
    )

    async for doc in cursor:
        url = doc.get("source_url", "")
        if "VistaPreviaPliego" in url:
            pliego += 1
        elif "ComprasElectronicas" in url:
            electronicas += 1
        else:
            other += 1

        fields = doc.get("metadata", {}).get("comprar_pliego_fields", {})
        if fields:
            has_fields += 1
        else:
            empty_fields += 1

    print(f"\nURL types:")
    print(f"  ComprasElectronicas (unstable): {electronicas}")
    print(f"  VistaPreviaPliego (stable): {pliego}")
    print(f"  Other: {other}")
    print(f"\nPliego fields:")
    print(f"  With fields: {has_fields}")
    print(f"  Empty fields: {empty_fields}")

    # Show a few samples with VistaPreviaPliego URLs
    print("\n--- Sample VistaPreviaPliego items ---")
    cursor = db.licitaciones.find(
        {"fuente": "COMPR.AR Mendoza", "source_url": {"$regex": "VistaPreviaPliego"}},
        {"source_url": 1, "enrichment_level": 1, "licitacion_number": 1, "title": 1}
    ).limit(3)
    async for doc in cursor:
        num = doc.get("licitacion_number", "?")
        enr = doc.get("enrichment_level", "?")
        url = doc.get("source_url", "")[:100]
        title = doc.get("title", "")[:60]
        print(f"  {num} (enr={enr}): {title}")
        print(f"    URL: {url}")

    # Check if VistaPreviaPliego URLs still work
    print("\n--- Testing VistaPreviaPliego URL ---")
    sample = await db.licitaciones.find_one(
        {"fuente": "COMPR.AR Mendoza", "source_url": {"$regex": "VistaPreviaPliego"}}
    )
    if sample:
        import aiohttp
        url = sample["source_url"]
        async with aiohttp.ClientSession() as s:
            async with s.get(url, ssl=False, timeout=aiohttp.ClientTimeout(total=30)) as r:
                raw = await r.read()
                html = raw.decode("utf-8", errors="replace")
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(html, "html.parser")
                title = soup.find("title")
                labels = soup.find_all("label")
                print(f"  Status: {r.status}")
                print(f"  Title: {title.get_text() if title else 'NO TITLE'}")
                print(f"  Labels: {len(labels)}")
                for lab in labels[:10]:
                    text = lab.get_text(" ", strip=True)
                    nxt = lab.find_next_sibling()
                    val = nxt.get_text(" ", strip=True)[:60] if nxt else "NO_SIB"
                    print(f"    [{text}] => [{val}]")

asyncio.run(main())
