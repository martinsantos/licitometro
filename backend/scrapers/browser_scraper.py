
import asyncio
import sys
import json
import re
from playwright.async_api import async_playwright

async def run_scraper(numero_proceso):
    result = {"success": False, "url": None, "html": None, "error": None}
    
    try:
        async with async_playwright() as p:
            # Launch browser
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()

            # 1. Establish session
            await page.goto("https://comprar.mendoza.gov.ar/Default.aspx")

            # 2. Go to Search
            await page.goto("https://comprar.mendoza.gov.ar/BuscarAvanzado2.aspx")

            # 3. Search
            await page.fill("#ctl00_CPH1_txtNumeroProceso", numero_proceso)
            await page.click("#ctl00_CPH1_btnListarPliegoNumero")
            
            # Wait for results
            await page.wait_for_selector("#ctl00_CPH1_GridListaPliegos_ctl02_lnkNumeroProceso", timeout=10000)

            # 4. Listener for URL
            url_found = None
            future_url = asyncio.get_running_loop().create_future()

            async def handle_request(request):
                nonlocal url_found
                if "VistaPreviaPliego" in request.url and "aspx" in request.url and not url_found:
                    url_found = request.url
                    if not future_url.done():
                        future_url.set_result(url_found)

            page.on("request", handle_request)

            # 5. Click to trigger
            await page.click("#ctl00_CPH1_GridListaPliegos_ctl02_lnkNumeroProceso")

            # Wait for URL capture (max 10s)
            try:
                await asyncio.wait_for(future_url, timeout=10.0)
            except asyncio.TimeoutError:
                pass

            if url_found:
                # If we found the URL, we might want the HTML content too.
                # Since it's likely in an iframe or popup, we can try to fetch it directly or access the frame.
                # Navigating to it is easiest
                await page.goto(url_found)
                content = await page.content()
                
                result["success"] = True
                result["url"] = url_found
                result["html"] = content
            else:
                result["error"] = "URL not found in network requests"

            await browser.close()

    except Exception as e:
        result["error"] = str(e)

    print(json.dumps(result))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Missing numero_proceso argument"}))
        sys.exit(1)
    
    numero = sys.argv[1]
    asyncio.run(run_scraper(numero))
