"""Diagnose COMPR.AR pliego download for a specific licitacion."""
import asyncio
import os
import json
import aiohttp
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from bs4 import BeautifulSoup

LIC_ID = "69dd052c63dc304b4209e5d9"


async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    lic = await db.licitaciones.find_one({"_id": ObjectId(LIC_ID)})
    if not lic:
        print("NOT FOUND")
        return

    src = lic.get("source_url", "")
    meta = lic.get("metadata") or {}
    pliego_url = meta.get("comprar_pliego_url", "")

    print(f"SOURCE_URL: {src}")
    print(f"PLIEGO_URL: {pliego_url}")
    print(f"FUENTE: {lic.get('fuente', '')}")
    print(f"LIC_NUM: {lic.get('licitacion_number', '')}")
    print(f"ATTACHED: {len(lic.get('attached_files') or [])}")

    # Check credentials
    import re
    domain = "comprar.mendoza.gov.ar"
    cred = await db.site_credentials.find_one({
        "enabled": True,
        "site_url": {"$regex": re.escape(domain), "$options": "i"},
    })
    if cred:
        print(f"\nCREDENTIALS: {cred.get('site_name')} user={cred.get('username')}")
    else:
        print("\nCREDENTIALS: NONE for comprar.mendoza.gov.ar!")

    # Fetch the COMPR.AR page
    url = pliego_url or src
    print(f"\nFETCHING: {url[:120]}")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, ssl=False, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                print(f"HTTP {resp.status} {resp.content_type}")
                text = await resp.text()
                print(f"PAGE LENGTH: {len(text)} chars")

                soup = BeautifulSoup(text, "html.parser")

                # Check if it's a real pliego page or redirected to portal
                title_tag = soup.find("title")
                print(f"PAGE TITLE: {title_tag.text.strip() if title_tag else 'N/A'}")

                # Find all links
                all_links = soup.find_all("a", href=True)
                print(f"TOTAL LINKS: {len(all_links)}")

                # Find download-related links
                for a in all_links:
                    href = a.get("href", "")
                    text_a = (a.text or "").strip()
                    if any(kw in href.lower() + text_a.lower() for kw in
                           ["pliego", "anexo", "download", "descargar", ".pdf", ".doc", ".zip", "adjunto"]):
                        print(f"  LINK: [{text_a[:40]}] -> {href[:100]}")

                # Check for specific COMPR.AR labels
                for label_text in ["Pliego", "Anexo", "Licitación", "Descargar", "Adjuntos"]:
                    elements = soup.find_all(string=lambda t: t and label_text.lower() in t.lower())
                    if elements:
                        print(f"  LABEL '{label_text}': {len(elements)} occurrences")

                # Show first 500 chars of visible text
                body_text = soup.get_text(separator=" ", strip=True)[:500]
                print(f"\nPAGE TEXT PREVIEW:\n{body_text}")

    except Exception as e:
        print(f"FETCH ERROR: {type(e).__name__}: {e}")


asyncio.run(run())
