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
    """Extract label-value pairs from the rendered detail popup.

    The GeneXus popup renders as a modal/overlay with a table containing
    label-value rows. We use the full page source and look for the popup
    content by searching for characteristic text like "Presupuesto Oficial".
    """
    result = {}
    try:
        page_source = driver.page_source
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(page_source, "html.parser")

        # Strategy 1: Find popup container by characteristic headers
        # GeneXus popups typically use a div with class containing "popup" or a
        # new table that appears with "Detalle de Licitación" heading
        popup_container = None

        # Look for "Detalle de Licitación" text anywhere
        for tag in soup.find_all(string=re.compile(r"Detalle\s+de\s+Licitaci|Ver\s+Licitaci", re.I)):
            # Walk up to find the popup container
            parent = tag.parent
            for _ in range(10):
                if parent is None:
                    break
                if parent.name in ("div", "table", "fieldset") and parent.find_all("td"):
                    popup_container = parent
                    break
                parent = parent.parent
            if popup_container:
                break

        if not popup_container:
            # Fallback: use full page but look for "Presupuesto Oficial" text
            presup = soup.find(string=re.compile(r"Presupuesto\s+Oficial", re.I))
            if presup:
                parent = presup.parent
                for _ in range(10):
                    if parent is None:
                        break
                    if parent.name in ("table", "div") and len(parent.find_all("td")) > 10:
                        popup_container = parent
                        break
                    parent = parent.parent

        if not popup_container:
            logger.debug("No popup container found")
            return result

        # Extract label-value pairs from the popup container
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

        cells = popup_container.find_all("td")
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

        # Strategy 2: Also try text-based extraction from full popup text
        popup_text = popup_container.get_text(" ", strip=True)
        if not result.get("budget_raw"):
            m = re.search(r"Presupuesto\s+Oficial\s+([\d.,]+)", popup_text, re.I)
            if m:
                result["budget_raw"] = m.group(1)
        if not result.get("currency_raw"):
            m = re.search(r"Moneda\s+(\w+)", popup_text, re.I)
            if m:
                result["currency_raw"] = m.group(1)
        if not result.get("description"):
            m = re.search(r"Descripci[oó]n\s+(.+?)(?:Presupuesto|Valor|Fecha|$)", popup_text, re.I)
            if m:
                result["description"] = m.group(1).strip()

        # Parse budget: "30.000.000,00" → 30000000.00
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

        # Parse expediente: "Nro 388815 Letra Año 2026" → "388815/2026"
        if result.get("expedient_raw"):
            m = re.search(r"Nro?\s*(\d+).*?A[ñn]o\s*(\d{4})", result["expedient_raw"], re.I)
            if m:
                result["expedient_number"] = f"{m.group(1)}/{m.group(2)}"

    except Exception as e:
        logger.warning(f"Error extracting detail popup: {e}")

    return result


def scrape_vigente_details(driver, limit=50) -> list:
    """Navigate ComprasApps, search vigentes, click each lupa, extract details.

    Uses JavaScript to click lupas by index (avoids stale element issues).
    After each click, waits for popup, extracts data, closes popup via JS.
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    results = []

    try:
        # Navigate to search page
        logger.info(f"Loading {BASE_URL}...")
        driver.get(BASE_URL)
        time.sleep(3)

        # Set search filters via JavaScript (more reliable than Selenium inputs)
        driver.execute_script("""
            document.querySelector('[name="vEJER"]').value = '2026';
            var sel = document.querySelector('[name="vESTFILTRO"]');
            if (sel) { sel.value = 'V'; }
        """)

        # Click Buscar via JS
        driver.execute_script("document.querySelector('[name=\"BUTTON1\"]').click()")
        time.sleep(4)

        page = 1
        while len(results) < limit:
            # Count lupas via JS (no stale element risk)
            lupa_count = driver.execute_script(
                "return document.querySelectorAll('img[src*=\"vermas\"]').length"
            )
            logger.info(f"Page {page}: {lupa_count} lupa icons")

            if lupa_count == 0:
                break

            for i in range(lupa_count):
                if len(results) >= limit:
                    break

                try:
                    # Get row ID via JS before clicking
                    row_id = driver.execute_script(f"""
                        var lupas = document.querySelectorAll('img[src*="vermas"]');
                        if ({i} >= lupas.length) return null;
                        var lupa = lupas[{i}];
                        var tr = lupa.closest('tr');
                        if (!tr) return 'unknown';
                        var cells = tr.querySelectorAll('td');
                        return cells.length > 0 ? cells[0].textContent.trim() : 'unknown';
                    """)

                    if not row_id:
                        continue

                    logger.info(f"  [{len(results)+1}/{limit}] Clicking lupa for {row_id}")

                    # Click lupa via JS (avoids stale element)
                    clicked = driver.execute_script(f"""
                        var lupas = document.querySelectorAll('img[src*="vermas"]');
                        if ({i} >= lupas.length) return false;
                        lupas[{i}].click();
                        return true;
                    """)

                    if not clicked:
                        continue

                    # Wait for popup to appear (look for "Detalle" or "Ver Licitación")
                    time.sleep(2.5)

                    # Extract detail from current page state
                    detail = extract_detail_from_popup(driver)
                    detail["row_id"] = row_id

                    budget = detail.get("budget_parsed")
                    desc = (detail.get("description") or "")[:50]
                    logger.info(f"    Budget: {budget}, Desc: {desc}")
                    results.append(detail)

                    # Close popup: try clicking close button, then Escape
                    driver.execute_script("""
                        // Try common close patterns
                        var closeBtn = document.querySelector('.popup-close, .modal-close, [title="Cerrar"], .gx-popup-close');
                        if (closeBtn) { closeBtn.click(); return; }
                        // Try clicking overlay/backdrop
                        var overlay = document.querySelector('.gx-popup-overlay, .modal-backdrop');
                        if (overlay) { overlay.click(); return; }
                        // Fallback: press Escape
                        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', keyCode: 27}));
                    """)
                    time.sleep(1)

                except Exception as e:
                    err_msg = str(e).split('\n')[0][:100]
                    logger.warning(f"  Error on row {i}: {err_msg}")
                    # Recovery: press Escape and continue
                    try:
                        driver.execute_script(
                            "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', keyCode: 27}))"
                        )
                    except Exception:
                        pass
                    time.sleep(1)

            # GeneXus pagination: no standard "next" link
            # Would need to POST with GXState pagination — skip for now
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
