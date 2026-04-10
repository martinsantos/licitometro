"""
Backfill ComprasApps Mendoza items with detail popup data (Presupuesto, Expediente, etc.)

Uses Selenium to click the magnifying glass icon on each grid row, capture
the popup content, and update the DB with extracted fields.

The GeneXus AJAX protocol for the 'VER' event has CSRF protection that prevents
programmatic HTTP-only access. Selenium is the only reliable approach.

Targets: vigente items without budget (the most valuable data to recover).

Usage:
  # Backfill vigentes without budget (default)
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \
      python3 scripts/backfill_comprasapps_details.py

  # Limit to N items
  python3 scripts/backfill_comprasapps_details.py --limit 50

  # Dry run (capture but don't update DB)
  python3 scripts/backfill_comprasapps_details.py --dry-run
"""

import argparse
import asyncio
import logging
import os
import re
import sys
import time
import json
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill_comprasapps_details")

BASE_URL = "https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00049"


def setup_selenium():
    """Initialize headless Chrome for ComprasApps."""
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-images")  # Faster loading
    options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(30)
    driver.implicitly_wait(5)
    return driver


def extract_detail_from_popup(driver) -> dict:
    """Extract label-value pairs from the rendered detail popup."""
    from selenium.webdriver.common.by import By

    result = {}
    try:
        # The popup renders as a table with label cells and value cells
        # Wait for popup content to load
        time.sleep(1)

        page_source = driver.page_source
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(page_source, "html.parser")

        # Find "Detalle de Licitación" or "Ver Licitación" heading
        detail_header = soup.find(string=re.compile(r"Detalle\s+de\s+Licitaci|Ver\s+Licitaci", re.I))
        if not detail_header:
            logger.debug("No detail header found in popup")
            return result

        # Find all text nodes and their adjacent values
        label_map = {
            "presupuesto oficial": "budget_raw",
            "moneda": "currency_raw",
            "descripci": "description",
            "expediente": "expedient_raw",
            "fecha de apertura": "opening_date_str",
            "hora de apertura": "opening_time_str",
            "repartici": "reparticion_destino",
            "norma legal": "norma_legal",
            "valor del pliego": "valor_pliego",
            "garant": "garantia_oferta",
            "plazo de entrega": "plazo_entrega",
            "lugar de entrega": "lugar_entrega",
            "forma de pago": "forma_pago",
            "organismo licitante": "organismo_licitante",
            "financiamiento": "financiamiento",
        }

        cells = soup.find_all("td")
        for i, cell in enumerate(cells):
            cell_text = cell.get_text(strip=True)
            cell_lower = cell_text.lower()
            for label_key, field_name in label_map.items():
                if label_key in cell_lower and field_name not in result:
                    for nc in cells[i + 1: i + 4]:
                        val = nc.get_text(strip=True)
                        if val and val.lower() != cell_lower and len(val) > 0:
                            result[field_name] = val
                            break
                    break

        # Parse budget
        if result.get("budget_raw"):
            try:
                raw = result["budget_raw"].replace(".", "").replace(",", ".")
                budget = float(raw)
                if budget > 0:
                    result["budget_parsed"] = budget
            except (ValueError, TypeError):
                pass

        # Parse currency
        currency_raw = (result.get("currency_raw") or "").upper()
        if "PESO" in currency_raw:
            result["currency"] = "ARS"
        elif "DOLAR" in currency_raw or "USD" in currency_raw:
            result["currency"] = "USD"
        else:
            result["currency"] = "ARS"

        # Parse expediente
        if result.get("expedient_raw"):
            m = re.search(r"Nro?\s*(\d+).*?A[ñn]o\s*(\d{4})", result["expedient_raw"], re.I)
            if m:
                result["expedient_number"] = f"{m.group(1)}/{m.group(2)}"

    except Exception as e:
        logger.warning(f"Error extracting detail popup: {e}")

    return result


def scrape_vigente_details(driver, limit=50) -> list:
    """Navigate ComprasApps, search vigentes, click each lupa, extract details."""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    results = []

    try:
        # Navigate to search page
        logger.info(f"Loading {BASE_URL}...")
        driver.get(BASE_URL)
        time.sleep(3)

        # Set search filters: Ejercicio=2026, Estado=Vigente
        ejer_input = driver.find_element(By.NAME, "vEJER")
        ejer_input.clear()
        ejer_input.send_keys("2026")

        # Set Estado to Vigente
        estado_select = driver.find_element(By.NAME, "vESTFILTRO")
        from selenium.webdriver.support.ui import Select
        Select(estado_select).select_by_value("V")

        # Click Buscar
        buscar_btn = driver.find_element(By.NAME, "BUTTON1")
        buscar_btn.click()
        time.sleep(3)

        page = 1
        while len(results) < limit:
            # Find all magnifying glass icons (vermas.png)
            lupas = driver.find_elements(By.CSS_SELECTOR, "img[src*='vermas']")
            logger.info(f"Page {page}: found {len(lupas)} lupa icons")

            if not lupas:
                break

            for i, lupa in enumerate(lupas):
                if len(results) >= limit:
                    break

                try:
                    # Get row identifier from same row
                    row_tr = lupa.find_element(By.XPATH, "./ancestor::tr")
                    row_cells = row_tr.find_elements(By.TAG_NAME, "td")
                    row_id = row_cells[0].text.strip() if row_cells else f"unknown-{i}"

                    logger.info(f"  Clicking lupa for row {row_id} ({len(results)+1}/{limit})")

                    # Click the lupa icon
                    lupa.click()
                    time.sleep(2)  # Wait for popup

                    # Extract detail from popup
                    detail = extract_detail_from_popup(driver)
                    detail["row_id"] = row_id

                    if detail.get("budget_parsed") or detail.get("description"):
                        results.append(detail)
                        logger.info(f"    Budget: {detail.get('budget_parsed')}, "
                                   f"Desc: {(detail.get('description') or '')[:50]}")
                    else:
                        logger.info(f"    No detail data extracted")
                        results.append(detail)  # Still save to track what was tried

                    # Close popup (click X button or press Escape)
                    try:
                        close_btn = driver.find_element(By.CSS_SELECTOR, ".popup-close, .modal-close, [title='Cerrar']")
                        close_btn.click()
                    except Exception:
                        try:
                            from selenium.webdriver.common.keys import Keys
                            driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
                        except Exception:
                            pass
                    time.sleep(0.5)

                except Exception as e:
                    logger.warning(f"  Error on row {i}: {e}")
                    # Try to recover by refreshing
                    try:
                        from selenium.webdriver.common.keys import Keys
                        driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
                    except Exception:
                        pass
                    time.sleep(1)

            # Try pagination (next page)
            try:
                next_links = driver.find_elements(By.CSS_SELECTOR, "a[href*='page'], input[value='>>']")
                if next_links:
                    next_links[0].click()
                    time.sleep(3)
                    page += 1
                else:
                    break
            except Exception:
                break

    except Exception as e:
        logger.error(f"Selenium scraping error: {e}")

    return results


async def update_db(db, details: list, dry_run: bool):
    """Update MongoDB with extracted detail data."""
    col = db.licitaciones
    updated = 0
    skipped = 0

    for detail in details:
        row_id = detail.get("row_id", "")
        if not row_id:
            skipped += 1
            continue

        # Find matching licitacion by id_licitacion (= ComprasApps numero)
        lic = await col.find_one(
            {"id_licitacion": row_id, "fuente": "ComprasApps Mendoza"},
            {"_id": 1, "budget": 1, "expedient_number": 1, "description": 1}
        )
        if not lic:
            logger.debug(f"No DB match for {row_id}")
            skipped += 1
            continue

        updates = {}
        if detail.get("budget_parsed") and not lic.get("budget"):
            updates["budget"] = detail["budget_parsed"]
            updates["currency"] = detail.get("currency", "ARS")
            updates["metadata.budget_source"] = "selenium_detail_popup"

        if detail.get("expedient_number") and not lic.get("expedient_number"):
            updates["expedient_number"] = detail["expedient_number"]

        if detail.get("description") and (not lic.get("description") or lic["description"] == row_id):
            updates["description"] = detail["description"]

        # Store full detail in metadata
        updates["metadata.detail_popup"] = {
            k: v for k, v in detail.items()
            if k not in ("budget_parsed", "row_id")
        }

        if updates and not dry_run:
            await col.update_one({"_id": lic["_id"]}, {"$set": updates})
            updated += 1
        elif updates:
            updated += 1
            logger.info(f"  DRY RUN: would update {row_id} with {list(updates.keys())}")
        else:
            skipped += 1

    return updated, skipped


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    # Selenium scraping (synchronous)
    logger.info(f"Starting Selenium detail scraping (limit={args.limit})...")
    driver = setup_selenium()
    try:
        details = scrape_vigente_details(driver, limit=args.limit)
        logger.info(f"\nCaptured {len(details)} detail records")
        with_budget = sum(1 for d in details if d.get("budget_parsed"))
        logger.info(f"  With budget: {with_budget}")
    finally:
        driver.quit()

    # DB update (async)
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitometro")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    updated, skipped = await update_db(db, details, args.dry_run)
    logger.info(f"\nDB Update: {updated} updated, {skipped} skipped")


if __name__ == "__main__":
    asyncio.run(main())
