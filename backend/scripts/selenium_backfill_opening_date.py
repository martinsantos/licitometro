"""
Targeted Selenium-based backfill for opening_date.

Uses Chrome/Selenium to navigate COMPR.AR list pages, click on each
process number to discover its pliego URL, then fetch the pliego page
to extract the opening_date.

Only processes records that are missing opening_date in MongoDB.

Usage:
    python backend/scripts/selenium_backfill_opening_date.py [--dry-run] [--max-pages 15]
"""

import asyncio
import logging
import sys
import argparse
import json
import re
import time
from pathlib import Path
from datetime import datetime

# Add parent paths
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pymongo import MongoClient
from typing import Optional, Dict, List
import httpx
from bs4 import BeautifulSoup
from utils.dates import parse_date_guess

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("selenium_backfill")

CACHE_PATH = Path(__file__).parent.parent / "storage" / "pliego_url_cache.json"
LIST_URL = "https://comprar.mendoza.gov.ar/Compras.aspx?qs=W1HXHGHtH10="
BASE_URL = "https://comprar.mendoza.gov.ar/"


def load_cache() -> dict:
    if CACHE_PATH.exists():
        try:
            with open(CACHE_PATH) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_cache(cache: dict):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_PATH, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def extract_apertura_from_pliego_html(html: str) -> Optional[datetime]:
    """Extract opening_date from a PLIEGO detail page."""
    soup = BeautifulSoup(html, 'html.parser')

    # Strategy 1: Labeled fields
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

    # Strategy 2: Cronograma table
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

    # Strategy 3: Regex in page text
    for elem in soup.find_all(['span', 'div', 'td', 'p']):
        text = elem.get_text(' ', strip=True)
        if re.search(r'apertura.*\d{2}[/\-]\d{2}[/\-]\d{4}', text, re.IGNORECASE):
            match = re.search(r'(\d{2}[/\-]\d{2}[/\-]\d{4}(?:\s+\d{2}:\d{2})?)', text)
            if match:
                parsed = parse_date_guess(match.group(1))
                if parsed:
                    return parsed

    return None


def collect_pliego_urls_selenium(target_numbers: set, max_pages: int = 15) -> Dict[str, str]:
    """
    Use Selenium to navigate COMPR.AR and collect pliego URLs
    for the given process numbers.
    """
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException

    mapping: Dict[str, str] = {}

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)

    try:
        driver = webdriver.Chrome(options=options)
        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    except Exception as exc:
        logger.error(f"Selenium/Chrome not available: {exc}")
        return mapping

    try:
        logger.info(f"Loading COMPR.AR list page: {LIST_URL}")
        driver.get(LIST_URL)

        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima"))
        )
        logger.info("List page loaded")

        current_page = 1
        processed_on_page = set()
        found_any_target = False

        while current_page <= max_pages:
            logger.info(f"--- Page {current_page} ---")

            # Get all process numbers on this page
            rows = driver.find_elements(By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima tr")
            page_items = []

            for row in rows:
                try:
                    cells = row.find_elements(By.TAG_NAME, "td")
                    if len(cells) < 6:
                        continue
                    num_cell = cells[0]
                    num_link = num_cell.find_element(By.TAG_NAME, "a")
                    numero = (num_link.text or num_link.get_attribute("textContent") or "").strip()
                    if numero and numero not in processed_on_page:
                        page_items.append((numero, num_link))
                        processed_on_page.add(numero)
                except Exception:
                    continue

            logger.info(f"  Found {len(page_items)} processes on page {current_page}")

            # Only process numbers we're looking for
            targets_on_page = [(n, link) for n, link in page_items if n in target_numbers]
            others_on_page = [(n, link) for n, link in page_items if n not in target_numbers]

            if targets_on_page:
                found_any_target = True
                logger.info(f"  {len(targets_on_page)} are targets we need: {[n for n, _ in targets_on_page]}")

            # Also collect non-target URLs (they enrich the cache for future use)
            all_to_process = targets_on_page + others_on_page

            for idx, (numero, num_link) in enumerate(all_to_process):
                is_target = numero in target_numbers
                try:
                    # Try onclick attribute first
                    onclick_attr = num_link.get_attribute('onclick') or ''
                    if onclick_attr:
                        m = re.search(r'(VistaPreviaPliegoCiudadano\.aspx\?qs=[^&"\'\s]+)', onclick_attr)
                        if m:
                            url = f"https://comprar.mendoza.gov.ar/PLIEGO/{m.group(1)}"
                            mapping[numero] = url
                            if is_target:
                                logger.info(f"  [onclick] {numero} -> {url[:80]}...")
                            continue

                    # Navigate to detail page
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", num_link)
                    time.sleep(0.3)

                    prev_url = driver.current_url
                    driver.execute_script("arguments[0].click();", num_link)

                    try:
                        WebDriverWait(driver, 10).until(EC.url_changes(prev_url))
                    except TimeoutException:
                        try:
                            num_link.click()
                            WebDriverWait(driver, 10).until(EC.url_changes(prev_url))
                        except Exception:
                            logger.warning(f"  Could not navigate for {numero}")
                            driver.get(LIST_URL)
                            WebDriverWait(driver, 20).until(
                                EC.presence_of_element_located((By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima"))
                            )
                            if current_page > 1:
                                _goto_page(driver, current_page)
                            continue

                    time.sleep(0.5)
                    current_url = driver.current_url

                    if current_url and "comprar.mendoza.gov.ar" in current_url:
                        if "Compras.aspx?qs=" not in current_url:
                            mapping[numero] = current_url
                            if is_target:
                                logger.info(f"  [nav] {numero} -> {current_url[:80]}...")

                    # Also check for pliego link in the detail page content
                    if numero not in mapping:
                        try:
                            page_source = driver.page_source
                            m = re.search(
                                r'(https?://comprar\.mendoza\.gov\.ar/PLIEGO/VistaPreviaPliegoCiudadano\.aspx\?qs=[^\s"\'<>]+)',
                                page_source
                            )
                            if m:
                                mapping[numero] = m.group(1)
                                if is_target:
                                    logger.info(f"  [html] {numero} -> {m.group(1)[:80]}...")
                        except Exception:
                            pass

                    # Go back to list
                    driver.get(LIST_URL)
                    WebDriverWait(driver, 20).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima"))
                    )
                    if current_page > 1:
                        _goto_page(driver, current_page)

                except Exception as e:
                    logger.warning(f"  Error processing {numero}: {e}")
                    try:
                        driver.get(LIST_URL)
                        WebDriverWait(driver, 20).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima"))
                        )
                        if current_page > 1:
                            _goto_page(driver, current_page)
                    except Exception:
                        pass

            # Try next page
            if current_page >= max_pages:
                break

            if not _goto_page(driver, current_page + 1):
                logger.info(f"  No more pages after page {current_page}")
                break

            current_page += 1

    except Exception as e:
        logger.error(f"Selenium error: {e}")
    finally:
        driver.quit()

    logger.info(f"Selenium collected {len(mapping)} URLs total")
    return mapping


def _goto_page(driver, page_num: int) -> bool:
    """Navigate to a specific page."""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    try:
        page_link = driver.find_element(By.LINK_TEXT, str(page_num))
        driver.execute_script("arguments[0].scrollIntoView(true);", page_link)
        driver.execute_script("arguments[0].click();", page_link)
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "#ctl00_CPH1_GridListaPliegosAperturaProxima"))
        )
        time.sleep(1)
        return True
    except Exception as e:
        logger.warning(f"Could not navigate to page {page_num}: {e}")
        return False


async def main():
    parser = argparse.ArgumentParser(description="Selenium-based backfill for opening_date")
    parser.add_argument("--dry-run", action="store_true", help="Don't update DB, just log")
    parser.add_argument("--max-pages", type=int, default=15, help="Max pages to scan (default: 15)")
    args = parser.parse_args()

    client = MongoClient("localhost", 27017)
    db = client["licitometro"]
    col = db["licitaciones"]

    # Find COMPR.AR records missing opening_date
    missing = list(col.find({
        "opening_date": None,
        "fuente": "COMPR.AR Mendoza",
        "licitacion_number": {"$ne": None}
    }, {"licitacion_number": 1, "_id": 1}))

    target_numbers = {d["licitacion_number"] for d in missing if d.get("licitacion_number")}
    logger.info(f"Need opening_date for {len(target_numbers)} COMPR.AR records")
    logger.info(f"Target numbers: {sorted(target_numbers)}")

    if not target_numbers:
        logger.info("Nothing to do!")
        client.close()
        return

    # Step 1: Run Selenium to collect pliego URLs
    logger.info("\n=== Step 1: Selenium pliego URL collection ===")
    pliego_map = collect_pliego_urls_selenium(target_numbers, max_pages=args.max_pages)

    # Update cache
    cache = load_cache()
    for numero, url in pliego_map.items():
        if numero not in cache:
            url_type = "pliego" if "VistaPreviaPliegoCiudadano" in url else "other"
            cache[numero] = {
                "url": url,
                "type": url_type,
                "timestamp": datetime.utcnow().isoformat()
            }
    save_cache(cache)
    logger.info(f"Cache updated: {len(cache)} total entries")

    # Step 2: Fetch pliego pages and extract opening_date
    logger.info("\n=== Step 2: Fetch pliego pages ===")
    updated = 0
    failed = []

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as http_client:
        for doc in missing:
            numero = doc["licitacion_number"]
            pliego_url = pliego_map.get(numero) or cache.get(numero, {}).get("url")

            if not pliego_url:
                logger.warning(f"  No pliego URL for {numero}")
                failed.append(numero)
                continue

            try:
                resp = await http_client.get(pliego_url)
                if resp.status_code != 200:
                    logger.warning(f"  HTTP {resp.status_code} for {numero}")
                    failed.append(numero)
                    continue

                opening_date = extract_apertura_from_pliego_html(resp.text)
                if opening_date:
                    if args.dry_run:
                        logger.info(f"  [DRY-RUN] {numero} -> opening_date={opening_date}")
                    else:
                        update_fields = {
                            "opening_date": opening_date,
                            "updated_at": datetime.utcnow()
                        }
                        if not col.find_one({"_id": doc["_id"]}).get("metadata", {}).get("comprar_pliego_url"):
                            update_fields["metadata.comprar_pliego_url"] = pliego_url
                        col.update_one({"_id": doc["_id"]}, {"$set": update_fields})
                        logger.info(f"  {numero} -> opening_date={opening_date}")
                    updated += 1
                else:
                    logger.warning(f"  Could not extract apertura from pliego for {numero}")
                    failed.append(numero)
            except Exception as e:
                logger.error(f"  Error for {numero}: {e}")
                failed.append(numero)

    # Final report
    total = col.count_documents({})
    still_missing = col.count_documents({"opening_date": None})
    has_date = col.count_documents({"opening_date": {"$ne": None}})

    logger.info(f"\n=== DONE ===")
    logger.info(f"Updated this run: {updated}")
    logger.info(f"Failed/no URL: {len(failed)} -> {failed}")
    logger.info(f"DB: {has_date}/{total} with opening_date ({has_date/total*100:.0f}%)")
    logger.info(f"Still missing: {still_missing}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
