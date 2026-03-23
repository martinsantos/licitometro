"""
COMPR.AR Mendoza - Router para acceso a procesos de compra.

Este modulo provee endpoints para acceder a procesos de COMPR.AR Mendoza.

IMPORTANTE: El sistema COMPR.AR usa ASP.NET WebForms con postbacks que son
dependientes de sesion. Los parametros `target` (ctl00$CPH1$Grid$ctlXX$lnk...)
cambian con cada carga de pagina y expiran con la sesion.

La UNICA URL estable es la URL PLIEGO: VistaPreviaPliegoCiudadano.aspx?qs=XXX

Estrategia:
1. Si tenemos URL PLIEGO guardada -> redirigir directamente
2. Si no -> buscar proceso por numero en la pagina actual y extraer PLIEGO URL
3. Cachear las URLs PLIEGO para futuras consultas
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.encoders import jsonable_encoder
from bs4 import BeautifulSoup
import aiohttp
import asyncio
import os
import logging
import html as html_escape
import re
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from urllib.parse import urljoin, quote_plus, urlparse, parse_qs

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from dependencies import get_licitacion_repository
from utils.time import utc_now
from db.repositories import LicitacionRepository

router = APIRouter(
    prefix="/api/comprar",
    tags=["comprar"],
    responses={404: {"description": "Not found"}},
)

logger = logging.getLogger("comprar_proxy")

# ============================================================================
# Cache para URLs PLIEGO (persistente en archivo)
# ============================================================================

PLIEGO_CACHE_FILE = Path("storage/pliego_url_cache.json")
PLIEGO_CACHE_TTL_HOURS = 168  # 7 dias


def _load_pliego_cache() -> Dict[str, Dict[str, Any]]:
    """Cargar cache de URLs PLIEGO desde disco"""
    if PLIEGO_CACHE_FILE.exists():
        try:
            with open(PLIEGO_CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading cache: {e}")
    return {}


def _save_pliego_cache(cache: Dict[str, Dict[str, Any]]):
    """Guardar cache de URLs PLIEGO a disco"""
    try:
        PLIEGO_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(PLIEGO_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Error saving cache: {e}")


def _get_cached_pliego_url(numero: str) -> Optional[str]:
    """Obtener URL PLIEGO cacheada si no expiro"""
    cache = _load_pliego_cache()
    # Normalizar el numero para busqueda
    numero_key = numero.strip().upper()

    if numero_key not in cache:
        return None

    entry = cache[numero_key]
    cached_time = datetime.fromisoformat(entry['timestamp'])

    if utc_now() - cached_time > timedelta(hours=PLIEGO_CACHE_TTL_HOURS):
        del cache[numero_key]
        _save_pliego_cache(cache)
        return None

    return entry.get('url')


def _cache_pliego_url(numero: str, url: str):
    """Guardar URL PLIEGO en cache"""
    cache = _load_pliego_cache()
    numero_key = numero.strip().upper()
    cache[numero_key] = {
        'url': url,
        'timestamp': utc_now().isoformat()
    }
    _save_pliego_cache(cache)
    logger.info(f"Cached PLIEGO URL for {numero_key}: {url}")


# ============================================================================
# Extraccion de datos de paginas COMPR.AR
# ============================================================================

def _extract_hidden_fields(html: str) -> dict:
    """Extraer campos ocultos ASP.NET de una pagina"""
    soup = BeautifulSoup(html, "html.parser")
    fields = {}
    for inp in soup.find_all("input"):
        name = inp.get("name")
        if name:
            fields[name] = inp.get("value", "")
    return fields


def _extract_pliego_url_from_html(html: str, base_url: str = "https://comprar.mendoza.gov.ar/") -> Optional[str]:
    """Extraer URL PLIEGO desde el HTML de detalle"""
    soup = BeautifulSoup(html, 'html.parser')

    # Estrategia 1: Link directo a VistaPreviaPliegoCiudadano o VistaPreviaPliego
    for a in soup.find_all('a', href=True):
        href = a.get('href', '')
        if 'VistaPreviaPliego' in href and '.aspx?qs=' in href:
            return urljoin(base_url, href)

    # Estrategia 2: Buscar en onclick handlers
    for elem in soup.find_all(onclick=True):
        onclick = elem.get('onclick', '')
        m = re.search(r"window\.open\(['\"]([^'\"]+VistaPreviaPliego[^'\"]*)['\"]", onclick)
        if m:
            return urljoin(base_url, m.group(1))

    # Estrategia 3: Buscar en el HTML raw
    patterns = [
        r'(PLIEGO[/\\]VistaPreviaPliegoCiudadano\.aspx\?qs=[^\s\"\'<>]+)',
        r'(PLIEGO[/\\]VistaPreviaPliego\.aspx\?qs=[^\s\"\'<>]+)',
        r'(ComprasElectronicas\.aspx\?qs=[^\s\"\'<>]+)',
    ]
    for pattern in patterns:
        m = re.search(pattern, html, re.IGNORECASE)
        if m:
            url = m.group(1).replace('\\/', '/')
            return urljoin(base_url, url)

    return None


def _find_process_row_in_list(html: str, numero: str) -> Optional[Dict[str, str]]:
    """
    Buscar un proceso por numero en la tabla del listado.
    Retorna el target postback si lo encuentra.
    """
    soup = BeautifulSoup(html, 'html.parser')
    table = soup.find('table', {'id': re.compile('GridListaPliegosAperturaProxima', re.I)})
    if not table:
        # Intentar otras tablas conocidas
        table = soup.find('table', {'id': re.compile('GridListaPliegos', re.I)})
    if not table:
        return None

    numero_normalized = numero.strip().upper()

    for row in table.find_all('tr'):
        cols = row.find_all('td')
        if len(cols) < 2:
            continue

        # El numero suele estar en la primera columna
        cell_text = cols[0].get_text(' ', strip=True).upper()

        if numero_normalized in cell_text:
            # Encontrado!
            logger.info(f"DEBUG: Found row for {numero}. Row HTML: {row}")
            
            # Buscar el link con postback
            link = cols[0].find('a', href=True)
            if link:
                href = link.get('href', '')
                m = re.search(r"__doPostBack\('([^']+)'\s*,\s*'([^']*)'\)", href)
                if m:
                    return {
                        'target': m.group(1),
                        'arg': m.group(2),
                        'numero': cols[0].get_text(' ', strip=True),
                        'titulo': cols[1].get_text(' ', strip=True) if len(cols) > 1 else '',
                    }

    return None


async def _search_and_resolve_pliego(numero: str, list_url: str) -> Optional[str]:
    """
    Buscar un proceso por numero en COMPR.AR y resolver su URL PLIEGO.
    Usa el flujo de Busqueda de Ciudadano para asegurar URLs publicas.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    }
    jar = aiohttp.CookieJar(unsafe=True)

    try:
        async with aiohttp.ClientSession(headers=headers, cookie_jar=jar) as session:
            # 1. Inicializar sesión (Default.aspx)
            async with session.get("https://comprar.mendoza.gov.ar/Default.aspx") as resp:
                if resp.status != 200:
                    logger.error(f"Failed to load Default.aspx: {resp.status}")
                await resp.read() # Consumir para cookies

            # 2. Ir al Buscador Ciudadano (BuscarAvanzado2.aspx)
            search_url = "https://comprar.mendoza.gov.ar/BuscarAvanzado2.aspx"
            async with session.get(search_url) as resp:
                if resp.status != 200:
                    logger.error(f"Failed to load search page: {resp.status}")
                    return None
                search_html = await resp.text()

            # 3. Ejecutar busqueda
            fields = _extract_hidden_fields(search_html)
            # Parametros específicos del buscador ciudadano
            fields["ctl00$CPH1$txtNumeroProceso"] = numero
            fields["ctl00$CPH1$btnListarPliegoNumero"] = "Buscar"
            
            async with session.post(search_url, data=fields) as resp:
                if resp.status != 200:
                    logger.error(f"Search failed: {resp.status}")
                    return None
                results_html = await resp.text()

            # 4. Buscar el proceso en la lista de resultados
            row_info = _find_process_row_in_list(results_html, numero)
            if not row_info:
                logger.warning(f"Process {numero} not found in citizen search results")
                return None

            # 5. Hacer postback para ir al detalle
            # En el buscador ciudadano, el click en el numero va a VistaPreviaPliego
            fields = _extract_hidden_fields(results_html)
            fields["__EVENTTARGET"] = row_info['target']
            fields["__EVENTARGUMENT"] = row_info.get('arg', '')
            # Limpiar el boton de busqueda para evitar conflicto
            if "ctl00$CPH1$btnListarPliegoNumero" in fields:
                del fields["ctl00$CPH1$btnListarPliegoNumero"]

            async with session.post(search_url, data=fields, allow_redirects=False) as resp:
                if resp.status == 302:
                    location = resp.headers.get("Location", "")
                    logger.info(f"DEBUG: Redirected to: {location}")
                    if "VistaPreviaPliego" in location:
                        pliego_url = urljoin("https://comprar.mendoza.gov.ar", location)
                        # Convertir a Ciudadano si es necesario
                        if "VistaPreviaPliego.aspx" in pliego_url:
                            pliego_url = pliego_url.replace("VistaPreviaPliego.aspx", "VistaPreviaPliegoCiudadano.aspx")
                        
                        _cache_pliego_url(numero, pliego_url)
                        logger.info(f"Resolved Public PLIEGO URL from Redirect: {pliego_url}")
                        return pliego_url
                    
                    # If not VistaPrevia, check if we should follow
                    if "ComprasElectronicas.aspx" in location:
                        # Falling back to vendor view but let's see if we can convert it?
                        # Usually QS is different so we can't.
                        logger.warning("Redirected to Vendor View (ComprasElectronicas)")
                        
                if resp.status != 200 and resp.status != 302:
                    logger.error(f"Failed to load detail page via postback: {resp.status}")
                    return None
                    
                # If we are here, it's 200 or 302 (followed manually if needed? no we returned if lucky)
                # If 302 and we didn't return, we might want to follow it to get HTML
                if resp.status == 302:
                     location = resp.headers.get("Location", "")
                     new_url = urljoin("https://comprar.mendoza.gov.ar", location)
                     async with session.get(new_url) as resp2:
                         detail_html = await resp2.text()
                else:
                     detail_html = await resp.text()

            # 6. Extraer la URL PLIEGO del detalle
            pliego_url = _extract_pliego_url_from_html(detail_html)
            
            # Check if URL is valid public url
            if pliego_url and "VistaPreviaPliego" in pliego_url:
                 # Convertir a Ciudadano si es necesario
                if "VistaPreviaPliego.aspx" in pliego_url:
                    pliego_url = pliego_url.replace("VistaPreviaPliego.aspx", "VistaPreviaPliegoCiudadano.aspx")
                
                _cache_pliego_url(numero, pliego_url)
                logger.info(f"Resolved Public PLIEGO URL: {pliego_url}")
                return pliego_url

            # Fallback to Browser Scraper if aiohttp failed to get public URL
            logger.info(f"Standard scraping failed to get Public URL for {numero}. Trying Browser Fallback...")
            browser_result = await _enrich_via_browser_fallback(numero)
            
            if browser_result and browser_result.get("success") and browser_result.get("url"):
                pliego_url = browser_result["url"]
                logger.info(f"Resolved Public PLIEGO URL via Browser: {pliego_url}")
                _cache_pliego_url(numero, pliego_url)
                return pliego_url
            
            if pliego_url:
                 logger.warning(f"Returning non-optimal URL: {pliego_url}")
                 return pliego_url

            logger.warning(f"PLIEGO URL not found in detail page for {numero}")
            return None

    except Exception as e:
        logger.error(f"Error resolving PLIEGO for {numero}: {e}")
        return None

def _resolve_pliego_url_selenium(numero: str, list_url: str, max_pages: int = 15) -> Optional[str]:
    """
    Use Selenium to navigate COMPR.AR list pages, find a process by number,
    click into its detail page, and extract the stable VistaPreviaPliegoCiudadano URL.

    This is a synchronous function (Selenium is blocking). Run in a thread from async code.
    """
    import time
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")

    try:
        driver = webdriver.Chrome(options=options)
    except Exception as e:
        logger.error(f"Selenium not available: {e}")
        return None

    try:
        logger.info(f"Selenium: searching for {numero} in {list_url}")
        driver.get(list_url)

        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima"))
        )

        numero_upper = numero.strip().upper()

        for page in range(1, max_pages + 1):
            logger.info(f"Selenium: scanning page {page}")
            rows = driver.find_elements(By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima tr")

            for row in rows:
                try:
                    cells = row.find_elements(By.TAG_NAME, "td")
                    if len(cells) < 3:
                        continue
                    cell_text = (cells[0].text or "").strip().upper()
                    if numero_upper not in cell_text:
                        continue

                    # Found the process — click into it
                    link = cells[0].find_element(By.TAG_NAME, "a")
                    prev_url = driver.current_url
                    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", link)
                    time.sleep(0.3)
                    driver.execute_script("arguments[0].click();", link)

                    try:
                        WebDriverWait(driver, 15).until(EC.url_changes(prev_url))
                    except TimeoutException:
                        link.click()
                        WebDriverWait(driver, 15).until(EC.url_changes(prev_url))

                    time.sleep(1)

                    # Check browser URL first
                    current_url = driver.current_url
                    if "VistaPreviaPliegoCiudadano" in current_url:
                        logger.info(f"Selenium: direct pliego URL for {numero}: {current_url}")
                        return current_url

                    # Search the rendered page for VistaPreviaPliegoCiudadano link
                    page_html = driver.page_source
                    match = re.search(
                        r'href="([^"]*VistaPreviaPliegoCiudadano\.aspx\?qs=[^"]+)"',
                        page_html
                    )
                    if match:
                        href = match.group(1)
                        if not href.startswith("http"):
                            href = f"https://comprar.mendoza.gov.ar{href}"
                        logger.info(f"Selenium: found pliego link for {numero}: {href}")
                        return href

                    # If we got ComprasElectronicas with content, extract pliego URL
                    if "ComprasElectronicas" in current_url:
                        # Try extracting from the full page source
                        pliego_match = re.search(
                            r'((?:PLIEGO/)?VistaPreviaPliego(?:Ciudadano)?\.aspx\?qs=[^\s"\'<>]+)',
                            page_html
                        )
                        if pliego_match:
                            pliego_url = pliego_match.group(1)
                            if "VistaPreviaPliego.aspx" in pliego_url:
                                pliego_url = pliego_url.replace("VistaPreviaPliego.aspx", "VistaPreviaPliegoCiudadano.aspx")
                            if not pliego_url.startswith("http"):
                                pliego_url = f"https://comprar.mendoza.gov.ar/{pliego_url}"
                            logger.info(f"Selenium: extracted pliego from ComprasElectronicas for {numero}: {pliego_url}")
                            return pliego_url

                    # Last resort: return ComprasElectronicas URL (has session-dependent content)
                    if "ComprasElectronicas" in current_url and "CPH1" in page_html:
                        logger.warning(f"Selenium: returning ComprasElectronicas (with content) for {numero}")
                        return current_url

                    logger.warning(f"Selenium: no pliego URL found on detail page for {numero}")
                    return None

                except Exception as e:
                    logger.warning(f"Selenium: error clicking {numero}: {e}")
                    continue

            # Navigate to next page
            try:
                next_link = driver.find_element(By.LINK_TEXT, str(page + 1))
                driver.execute_script("arguments[0].scrollIntoView(true);", next_link)
                driver.execute_script("arguments[0].click();", next_link)
                WebDriverWait(driver, 15).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima"))
                )
                time.sleep(1)
            except Exception:
                logger.info(f"Selenium: no page {page + 1}, stopping search")
                break

        logger.warning(f"Selenium: {numero} not found after {max_pages} pages")
        return None

    except Exception as e:
        logger.error(f"Selenium search error: {e}")
        return None
    finally:
        driver.quit()



# ============================================================================
# Endpoints
# ============================================================================

@router.get("/resolve/{numero}")
async def resolve_comprar_proceso(
    numero: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """
    Resolver la URL PLIEGO para un proceso de COMPR.AR por su numero.

    Este endpoint es el reemplazo estable para el antiguo /proceso/open.

    Estrategia:
    1. Buscar en cache
    2. Buscar en MongoDB (metadata.comprar_pliego_url)
    3. Buscar en COMPR.AR en tiempo real
    4. Redirigir a la URL PLIEGO o retornar error
    """
    numero = numero.strip()

    # 1. Buscar en cache local
    cached_url = _get_cached_pliego_url(numero)
    if cached_url:
        logger.info(f"Cache hit for {numero}")
        return RedirectResponse(url=cached_url, status_code=302)

    # 2. Buscar en MongoDB
    try:
        # Buscar por id_licitacion o licitacion_number
        filters = {"$or": [
            {"id_licitacion": numero},
            {"licitacion_number": numero},
            {"id_licitacion": numero.upper()},
            {"licitacion_number": numero.upper()},
        ]}
        items = await repo.get_all(skip=0, limit=1, filters=filters)

        if items:
            lic = items[0]
            # Buscar URL PLIEGO en metadata
            metadata = lic.get('metadata', {}) or {}
            pliego_url = metadata.get('comprar_pliego_url')

            if pliego_url:
                _cache_pliego_url(numero, pliego_url)
                return RedirectResponse(url=pliego_url, status_code=302)

            # Buscar en source_url
            source_url = lic.get('source_url', '')
            if source_url and 'VistaPreviaPliegoCiudadano' in str(source_url):
                _cache_pliego_url(numero, str(source_url))
                return RedirectResponse(url=str(source_url), status_code=302)
    except Exception as e:
        logger.error(f"Error searching MongoDB for {numero}: {e}")

    # 3. Buscar en COMPR.AR en tiempo real
    list_urls = [
        "https://comprar.mendoza.gov.ar/Compras.aspx?qs=W1HXHGHtH10=",  # Apertura proxima
        "https://comprar.mendoza.gov.ar/Compras.aspx?qs=V1HXLCHtH10=",  # Ultimos 30 dias
    ]

    for list_url in list_urls:
        pliego_url = await _search_and_resolve_pliego(numero, list_url)
        if pliego_url:
            return RedirectResponse(url=pliego_url, status_code=302)

    # No encontrado
    return JSONResponse(
        status_code=404,
        content={
            "error": "Proceso no encontrado",
            "numero": numero,
            "message": "El proceso no se encontro en COMPR.AR. Puede que haya expirado o el numero sea incorrecto."
        }
    )


@router.get("/proceso/by-id/{licitacion_id}")
async def comprar_proceso_by_id(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """
    Resolver y redirigir a un proceso de COMPR.AR por ID de licitacion (MongoDB _id).
    """
    try:
        lic = await repo.get_by_id(licitacion_id)
        if not lic:
            raise HTTPException(status_code=404, detail="Licitacion no encontrada")

        # Buscar la mejor URL disponible
        metadata = lic.get('metadata', {}) or {}

        # Prioridad 1: URL PLIEGO directa
        pliego_url = metadata.get('comprar_pliego_url')
        if pliego_url:
            return RedirectResponse(url=pliego_url, status_code=302)

        # Prioridad 2: source_url con PLIEGO
        source_url = lic.get('source_url', '')
        if source_url and 'VistaPreviaPliegoCiudadano' in str(source_url):
            return RedirectResponse(url=str(source_url), status_code=302)

        # Prioridad 3: Resolver por numero
        numero = lic.get('licitacion_number') or lic.get('id_licitacion')
        if numero:
            return await resolve_comprar_proceso(numero, repo)

        raise HTTPException(
            status_code=404,
            detail="No se pudo resolver la URL del proceso"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resolving by ID {licitacion_id}: {e}")
        raise HTTPException(status_code=500, detail="Error interno")


@router.get("/proceso/open", response_class=HTMLResponse)
async def comprar_proceso_open(
    list_url: str = Query(..., description="Lista Compras.aspx con qs"),
    target: str = Query(..., description="Postback target del proceso"),
):
    """
    [LEGACY] Abrir proceso usando postback.

    ADVERTENCIA: Este endpoint usa targets ASP.NET que expiran con la sesion.
    Preferir usar /resolve/{numero} o /proceso/by-id/{id} para URLs estables.
    """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        }
        jar = aiohttp.CookieJar(unsafe=True)
        async with aiohttp.ClientSession(headers=headers, cookie_jar=jar) as session:
            async with session.get(list_url) as resp:
                if resp.status != 200:
                    raise HTTPException(status_code=502, detail="No se pudo acceder a la lista de compras.")
                list_html = await resp.text()

            fields = _extract_hidden_fields(list_html)
            fields["__EVENTTARGET"] = target
            fields["__EVENTARGUMENT"] = ""

            # Intentar extraer la URL PLIEGO primero
            async with session.post(list_url, data=fields) as resp:
                if resp.status == 200:
                    detail_html = await resp.text()
                    pliego_url = _extract_pliego_url_from_html(detail_html)
                    if pliego_url:
                        # Redirigir directamente a la URL PLIEGO estable
                        return RedirectResponse(url=pliego_url, status_code=302)

            # Fallback: formulario auto-submit (comportamiento legacy)
            inputs = "\n".join(
                f'<input type="hidden" name="{html_escape.escape(k)}" value="{html_escape.escape(v)}" />'
                for k, v in fields.items()
            )
            html = f"""<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Abrir proceso COMPR.AR</title>
  </head>
  <body>
    <form id="comprarForm" method="post" action="{html_escape.escape(list_url)}" target="_blank">
      {inputs}
      <noscript>
        <p>Presiona el boton para abrir el proceso en COMPR.AR.</p>
        <button type="submit">Abrir proceso</button>
      </noscript>
    </form>
    <script>document.getElementById('comprarForm').submit();</script>
  </body>
</html>"""
            return HTMLResponse(content=html)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error proxying proceso: {exc}")
        raise HTTPException(status_code=500, detail="Error interno al abrir el proceso.")


@router.get("/proceso/html", response_class=HTMLResponse)
async def comprar_proceso_html(
    list_url: str = Query(..., description="Lista Compras.aspx con qs"),
    target: str = Query(..., description="Postback target del proceso"),
):
    """
    [LEGACY] Obtener HTML del detalle de un proceso.

    ADVERTENCIA: Este endpoint usa targets ASP.NET que expiran con la sesion.
    """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        }
        jar = aiohttp.CookieJar(unsafe=True)
        async with aiohttp.ClientSession(headers=headers, cookie_jar=jar) as session:
            async with session.get(list_url) as resp:
                if resp.status != 200:
                    raise HTTPException(status_code=502, detail="No se pudo acceder a la lista de compras.")
                list_html = await resp.text()

            fields = _extract_hidden_fields(list_html)
            fields["__EVENTTARGET"] = target
            fields["__EVENTARGUMENT"] = ""
            async with session.post(list_url, data=fields) as resp:
                if resp.status != 200:
                    raise HTTPException(status_code=502, detail="No se pudo abrir el proceso solicitado.")
                detail_html = await resp.text()
                # Inject base href to resolve assets correctly
                base_tag = '<base href="https://comprar.mendoza.gov.ar/" />'
                if "<head>" in detail_html:
                    detail_html = detail_html.replace("<head>", f"<head>{base_tag}", 1)
                return HTMLResponse(content=detail_html)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error proxying proceso html: {exc}")
        raise HTTPException(status_code=500, detail="Error interno al abrir el proceso.")


@router.post("/enrich/{licitacion_id}")
async def enrich_licitacion(
    licitacion_id: str,
    level: int = Query(2, ge=2, le=3, description="Enrichment level: 2=detailed, 3=documents"),
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """
    Scraping de segunda generación: enriquecer una licitación con datos detallados.

    Este endpoint se llama cuando un usuario marca como favorito un proceso
    o solicita "más información". Obtiene todos los datos detallados del
    proceso desde COMPR.AR y actualiza la base de datos.

    Soporta dos tipos de páginas COMPR.AR:
    - VistaPreviaPliegoCiudadano.aspx (PLIEGO) - vista previa
    - ComprasElectronicas.aspx - página principal de detalle

    Extrae:
    - CRONOGRAMA completo
    - Listado de ITEMS/productos
    - CIRCULARES
    - Pliegos de bases y condiciones
    - Requisitos de participación
    - Actos administrativos
    - Solicitudes de contratación
    """
    try:
        # Obtener la licitación actual
        lic = await repo.get_by_id(licitacion_id)
        if not lic:
            raise HTTPException(status_code=404, detail="Licitación no encontrada")

        # Verificar que sea de COMPR.AR
        fuente = lic.get('fuente', '')
        if 'COMPR.AR' not in fuente:
            return JSONResponse(content={
                "success": False,
                "message": "Esta licitación no es de COMPR.AR, no se puede enriquecer",
                "data": jsonable_encoder(lic)
            })

        metadata = lic.get('metadata', {}) or {}

        # Lista de URLs a intentar (en orden de preferencia)
        # ONLY stable VistaPreviaPliegoCiudadano URLs + cache.
        # ComprasElectronicas URLs are session-dependent and expire after ~24h.
        urls_to_try = []
        seen_urls = set()

        def _add_url(kind, url):
            if url and url not in seen_urls:
                seen_urls.add(url)
                urls_to_try.append((kind, url))

        # 1. URL PLIEGO si existe (only if stable)
        pliego_url = metadata.get('comprar_pliego_url')
        if pliego_url and 'VistaPreviaPliegoCiudadano' in pliego_url:
            _add_url('pliego', pliego_url)

        # 2. source_url con PLIEGO
        source_url = str(lic.get('source_url', '') or '')
        if source_url and 'VistaPreviaPliegoCiudadano' in source_url:
            _add_url('pliego', source_url)

        # 3. source_urls dict — pliego key
        source_urls_dict = lic.get('source_urls') or {}
        pliego_from_dict = source_urls_dict.get('comprar_pliego', '')
        if pliego_from_dict and 'VistaPreviaPliegoCiudadano' in pliego_from_dict:
            _add_url('pliego', pliego_from_dict)

        # 4. canonical_url con PLIEGO
        canonical_url = str(lic.get('canonical_url', '') or '')
        if canonical_url and 'VistaPreviaPliegoCiudadano' in canonical_url:
            _add_url('pliego', canonical_url)

        # 5. Cache por número
        numero = lic.get('licitacion_number') or lic.get('id_licitacion')
        if numero:
            cached = _get_cached_pliego_url(numero)
            if cached:
                _add_url('cached', cached)

        if not urls_to_try:
            logger.warning(f"No URL found for licitacion {licitacion_id}")
            return JSONResponse(content={
                "success": False,
                "message": "No se encontró URL de detalle para este proceso. El proceso puede no tener página de pliego disponible.",
                "tried_sources": ["pliego_url", "source_url", "detail_url", "canonical_url", "cache"],
                "data": jsonable_encoder(lic)
            })

        # Intentar cada URL hasta que una funcione
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        }

        page_html = None
        successful_url = None
        url_type = None
        errors_log = []

        async with aiohttp.ClientSession(headers=headers) as session:
            for url_kind, url in urls_to_try:
                try:
                    logger.info(f"Trying {url_kind} URL: {url[:80]}...")
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=30), ssl=False) as resp:
                        if resp.status == 200:
                            html = await resp.text()
                            # Verificar que el HTML tiene contenido útil
                            if len(html) > 1000 and ('CPH1' in html or 'ContentPlaceHolder' in html or 'Cronograma' in html):
                                page_html = html
                                successful_url = url
                                url_type = url_kind
                                logger.info(f"Successfully fetched {url_kind} URL ({len(html)} bytes)")
                                break
                            else:
                                errors_log.append(f"{url_kind}: Página sin contenido útil")
                        else:
                            errors_log.append(f"{url_kind}: HTTP {resp.status}")
                except asyncio.TimeoutError:
                    errors_log.append(f"{url_kind}: Timeout")
                except Exception as e:
                    errors_log.append(f"{url_kind}: {str(e)[:50]}")



        # Si fallaron las URLs directas, intentar búsqueda por número via Selenium
        if not page_html:
            logger.info(f"Direct URLs failed, trying Selenium search for: {numero}")
            if numero:
                list_url = metadata.get('comprar_list_url') or "https://comprar.mendoza.gov.ar/Compras.aspx?qs=W1HXHGHtH10="

                try:
                    # Run Selenium in a thread (it's synchronous/blocking)
                    import concurrent.futures
                    loop = asyncio.get_event_loop()
                    with concurrent.futures.ThreadPoolExecutor() as pool:
                        found_url = await loop.run_in_executor(
                            pool, _resolve_pliego_url_selenium, numero, list_url
                        )

                    if found_url:
                        logger.info(f"Selenium found URL: {found_url}")
                        _cache_pliego_url(numero, found_url)

                        # Fetch the found URL to get page HTML
                        async with aiohttp.ClientSession(headers=headers) as session:
                            async with session.get(found_url, timeout=aiohttp.ClientTimeout(total=30), ssl=False) as resp:
                                if resp.status == 200:
                                    html = await resp.text()
                                    if len(html) > 1000:
                                        page_html = html
                                        successful_url = found_url
                                        url_type = "selenium_resolved"

                        # Also update the licitacion with the new stable URL
                        if found_url and "VistaPreviaPliego" in found_url:
                            try:
                                from bson import ObjectId
                                from dependencies import database as db_ref
                                if db_ref is not None:
                                    await db_ref.licitaciones.update_one(
                                        {"_id": ObjectId(licitacion_id)},
                                        {"$set": {
                                            "source_url": found_url,
                                            "canonical_url": found_url,
                                            "url_quality": "direct",
                                            "metadata.comprar_pliego_url": found_url,
                                            "source_urls.comprar_pliego": found_url,
                                        }}
                                    )
                                    logger.info(f"Updated source_url to stable pliego URL for {licitacion_id}")
                            except Exception as url_update_err:
                                logger.warning(f"Could not update source_url: {url_update_err}")

                except Exception as e:
                    logger.error(f"Error in Selenium fallback: {e}")
                    errors_log.append(f"selenium_fallback: {str(e)}")

        if not page_html:
            logger.error(f"Could not fetch any URL for {licitacion_id} even after search: {errors_log}")
            return JSONResponse(content={
                "success": False,
                "message": f"No se pudo acceder a ninguna URL del proceso. Intentos: {len(urls_to_try)} + búsqueda",
                "errors": errors_log,
                "urls_tried": [u[1][:60] + "..." for u in urls_to_try],
                "data": jsonable_encoder(lic)
            })

        # Parsear los datos usando el scraper
        from scrapers.mendoza_compra import MendozaCompraScraper
        scraper = MendozaCompraScraper(config={})
        parsed_data = scraper._parse_pliego_fields(page_html)

        # Construir los datos a actualizar
        update_data = {}

        # CRONOGRAMA
        if parsed_data.get("Fecha y hora estimada de publicación en el portal"):
            from scrapers.mendoza_compra import parse_date_guess
            val = parse_date_guess(parsed_data["Fecha y hora estimada de publicación en el portal"])
            if val:
                update_data["fecha_publicacion_portal"] = val

        if parsed_data.get("Fecha y hora inicio de consultas"):
            from scrapers.mendoza_compra import parse_date_guess
            val = parse_date_guess(parsed_data["Fecha y hora inicio de consultas"])
            if val:
                update_data["fecha_inicio_consultas"] = val

        if parsed_data.get("Fecha y hora final de consultas"):
            from scrapers.mendoza_compra import parse_date_guess
            val = parse_date_guess(parsed_data["Fecha y hora final de consultas"])
            if val:
                update_data["fecha_fin_consultas"] = val

        if parsed_data.get("Fecha y hora acto de apertura"):
            from scrapers.mendoza_compra import parse_date_guess
            val = parse_date_guess(parsed_data["Fecha y hora acto de apertura"])
            if val:
                update_data["opening_date"] = val

        # INFO BÁSICA
        if parsed_data.get("Etapa"):
            update_data["etapa"] = parsed_data["Etapa"]
        if parsed_data.get("Modalidad"):
            update_data["modalidad"] = parsed_data["Modalidad"]
        if parsed_data.get("Alcance"):
            update_data["alcance"] = parsed_data["Alcance"]
        if parsed_data.get("Encuadre legal"):
            update_data["encuadre_legal"] = parsed_data["Encuadre legal"]
        if parsed_data.get("Tipo de cotización"):
            update_data["tipo_cotizacion"] = parsed_data["Tipo de cotización"]
        if parsed_data.get("Tipo de adjudicación"):
            update_data["tipo_adjudicacion"] = parsed_data["Tipo de adjudicación"]
        if parsed_data.get("Duración del contrato"):
            update_data["duracion_contrato"] = parsed_data["Duración del contrato"]

        # LISTAS
        if parsed_data.get("_items"):
            update_data["items"] = parsed_data["_items"]
        if parsed_data.get("_solicitudes"):
            update_data["solicitudes_contratacion"] = parsed_data["_solicitudes"]
        if parsed_data.get("_pliegos_bases"):
            update_data["pliegos_bases"] = parsed_data["_pliegos_bases"]
        if parsed_data.get("_requisitos_participacion"):
            update_data["requisitos_participacion"] = parsed_data["_requisitos_participacion"]
        if parsed_data.get("_actos_administrativos"):
            update_data["actos_administrativos"] = parsed_data["_actos_administrativos"]
        if parsed_data.get("_circulares"):
            update_data["circulares"] = parsed_data["_circulares"]
        if parsed_data.get("_garantias"):
            update_data["garantias"] = parsed_data["_garantias"]
            
        # Combine files and anexos into attached_files
        all_files = []
        if parsed_data.get("_attached_files"):
            all_files.extend(parsed_data["_attached_files"])
            
        if parsed_data.get("_anexos"):
            for a in parsed_data["_anexos"]:
                 all_files.append({
                     "name": f"ANEXO: {a.get('nombre', '')} - {a.get('descripcion', '')}".strip(),
                     "url": a.get('link', ''),
                     "type": "anexo",
                     "metadata": a # Store original fields
                 })
        
        if all_files:
            update_data["attached_files"] = all_files
            
        # DEBUG: Write update_data to log file
        try:
            with open("enrich_debug.log", "a") as f:
                import json
                f.write(f"\n--- ENRICH DEBUG {datetime.now()} ---\n")
                f.write(f"ID: {id}\n")
                f.write(f"Parsed keys: {list(parsed_data.keys())}\n")
                f.write(f"Update Data keys: {list(update_data.keys())}\n")
                if "garantias" in update_data:
                    f.write(f"Garantias count: {len(update_data['garantias'])}\n")
                else:
                    f.write("No garantias in update_data\n")
        except Exception as e:
            logger.error(f"Debug log error: {e}")

        # Update metadata


        # CLASIFICACIÓN AUTOMÁTICA
        # Intentar mejorar la clasificación con los nuevos datos
        try:
            from services.category_classifier import classify_licitacion
            
            # Combinar datos existentes con nuevos
            classify_data = {
                "title": lic.get("title") or "",
                "description": update_data.get("description") or lic.get("description") or "",
                "keywords": lic.get("keywords") or []
            }
            
            # Agregar items a verificar
            if "items" in update_data:
                items_text = [i.get("descripcion", "") for i in update_data["items"]]
                classify_data["keywords"].extend(items_text)
                
            new_category = classify_licitacion(classify_data)
            if new_category and new_category != lic.get("category"):
                update_data["category"] = new_category
                logger.info(f"Auto-classified as: {new_category}")
        except Exception as e:
            logger.error(f"Error auto-classifying: {e}")

        # Metadata adicional
        update_data["metadata"] = {
            **metadata,
            "enriched_at": utc_now().isoformat(),
            "enriched_from_url": successful_url,
            "enriched_url_type": url_type,
            # Asegurar que la URL del pliego esté disponible para el frontend
            "comprar_pliego_url": successful_url,
            "comprar_pliego_fields": {
                k: v for k, v in parsed_data.items()
                if not k.startswith("_") and v
            }
        }

        # Track enrichment level
        update_data["enrichment_level"] = level
        update_data["last_enrichment"] = utc_now()
        if update_data.get("attached_files"):
            update_data["document_count"] = len(update_data["attached_files"])

        # Actualizar en MongoDB
        if update_data:
            from models.licitacion import LicitacionUpdate
            lic_update_model = LicitacionUpdate(**update_data)
            await repo.update(licitacion_id, lic_update_model)
            logger.info(f"Enriched licitacion {licitacion_id} with {len(update_data)} fields from {url_type} (level {level})")

        # Obtener el registro actualizado
        updated_lic = await repo.get_by_id(licitacion_id)

        fields_count = len([k for k in update_data.keys() if k not in ('metadata', 'enrichment_level', 'last_enrichment')])

        return JSONResponse(content={
            "success": True,
            "message": f"Datos actualizados: {fields_count} campos desde {url_type}",
            "enrichment_level": level,
            "fields_updated": [k for k in update_data.keys() if k not in ('metadata', 'enrichment_level', 'last_enrichment')],
            "source_url_type": url_type,
            "data": jsonable_encoder(updated_lic)
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error enriching licitacion {licitacion_id}: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Error interno: {str(e)}",
                "error_type": type(e).__name__
            }
        )


@router.get("/cache/stats")
async def get_cache_stats():
    """Obtener estadisticas del cache de URLs PLIEGO"""
    cache = _load_pliego_cache()
    now = utc_now()

    valid = 0
    expired = 0
    for entry in cache.values():
        cached_time = datetime.fromisoformat(entry['timestamp'])
        if now - cached_time <= timedelta(hours=PLIEGO_CACHE_TTL_HOURS):
            valid += 1
        else:
            expired += 1

    return {
        "total": len(cache),
        "valid": valid,
        "expired": expired,
        "ttl_hours": PLIEGO_CACHE_TTL_HOURS
    }


@router.post("/cache/clear")
async def clear_cache():
    """Limpiar el cache de URLs PLIEGO"""
    try:
        if PLIEGO_CACHE_FILE.exists():
            PLIEGO_CACHE_FILE.unlink()
        return {"message": "Cache cleared", "success": True}
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        raise HTTPException(status_code=500, detail="Error clearing cache")
