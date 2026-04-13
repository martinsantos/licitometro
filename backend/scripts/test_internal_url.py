"""Test if COMPR.AR internal URL works with auth when citizen URL expired."""
import asyncio, os, re
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

LIC_ID = "69dd052c63dc304b4209e5d9"

async def test():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    lic = await db.licitaciones.find_one({"_id": ObjectId(LIC_ID)})

    citizen_url = lic.get("source_url", "")
    print(f"Citizen URL: {citizen_url[:80]}")

    # Convert citizen URL to internal URL
    internal_url = citizen_url.replace("VistaPreviaPliegoCiudadano.aspx", "PLIEGO/VistaPreviaPliego.aspx")
    print(f"Internal URL: {internal_url[:80]}")

    # Try fetching with auth
    from services.comprar_pliego_downloader import ComprarPliegoDownloader
    import aiohttp

    dl = ComprarPliegoDownloader(db)
    dl.base_url = "https://comprar.mendoza.gov.ar"
    dl.domain = "comprar.mendoza.gov.ar"
    await dl._load_credentials()
    print(f"Credentials: user={dl.user}")

    jar = aiohttp.CookieJar(unsafe=True)
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    connector = aiohttp.TCPConnector(ssl=False)

    async with aiohttp.ClientSession(headers=headers, cookie_jar=jar, connector=connector) as session:
        # 1. Login
        ok = await dl._login(session)
        print(f"Login: {ok}")
        if not ok:
            return

        # 2. Try citizen URL with auth
        await asyncio.sleep(1)
        async with session.get(citizen_url) as resp:
            text = await resp.text()
            is_error = "problema" in text.lower() or "error" in text.lower()[:200]
            print(f"Citizen with auth: {resp.status}, error={is_error}, len={len(text)}")

        # 3. Try internal URL with auth
        await asyncio.sleep(1)
        async with session.get(internal_url) as resp:
            text = await resp.text()
            is_error = "problema" in text.lower() or "error" in text.lower()[:200]
            has_proceso = "30803" in text or "CONTRATACION" in text.upper()
            print(f"Internal with auth: {resp.status}, error={is_error}, has_proceso={has_proceso}, len={len(text)}")
            if has_proceso:
                # Look for pliego data
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(text, "html.parser")
                title = soup.find("title")
                print(f"  Title: {title.text.strip() if title else 'N/A'}")
                # Find anexo download links
                anexos = [a for a in soup.find_all("a", href=True) if "anexo" in a.get("href", "").lower() or "btnVer" in a.get("href", "")]
                print(f"  Anexo links: {len(anexos)}")
                for a in anexos[:3]:
                    print(f"    {a.text.strip()[:40]} -> {a.get('href','')[:60]}")

asyncio.run(test())
