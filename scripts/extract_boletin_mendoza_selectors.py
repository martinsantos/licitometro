#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from bs4 import BeautifulSoup

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.selenium_manager import SeleniumManager
    from selenium.webdriver.support.ui import Select
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait
except Exception as exc:  # pragma: no cover - runtime guard
    print("Selenium not available. Install selenium and a Chrome/Chromium driver.", file=sys.stderr)
    raise


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_HTML = ROOT / "docs" / "boletin_mendoza_results.html"
OUTPUT_CONFIG = ROOT / "docs" / "boletin_mendoza_scraper_config.json"

DEFAULT_URL = "https://informacionoficial.mendoza.gob.ar/boletinoficial/busqueda-avanzada/"


def _last_business_days(count: int) -> List[str]:
    from datetime import date, timedelta

    days: List[date] = []
    current = date.today()
    while len(days) < count:
        if current.weekday() < 5:
            days.append(current)
        current -= timedelta(days=1)
    days = sorted(days)
    return [d.strftime("%d/%m/%Y") for d in days]


@dataclass
class SelectorGuess:
    result_item: Optional[str] = None
    result_title: Optional[str] = None
    result_date: Optional[str] = None
    result_link: Optional[str] = None
    result_description: Optional[str] = None
    result_organization: Optional[str] = None
    next_page_selector: Optional[str] = None
    date_from_name: Optional[str] = None
    date_to_name: Optional[str] = None


def _css_from_tag_and_class(tag: str, classes: List[str]) -> str:
    classes = [c for c in classes if c]
    if not classes:
        return tag
    return tag + "".join(f".{c}" for c in classes)


def _find_date_input(driver: webdriver.Chrome, label_text: str) -> Optional[Tuple[str, str]]:
    try:
        label = driver.find_element(By.XPATH, f"//label[contains(., '{label_text}')]")
        for_attr = label.get_attribute("for")
        if for_attr:
            inp = driver.find_element(By.ID, for_attr)
            return inp.get_attribute("name"), inp.get_attribute("id")
    except Exception:
        pass
    return None


def _guess_selectors_from_html(html: str) -> SelectorGuess:
    soup = BeautifulSoup(html, "html.parser")
    guess = SelectorGuess()

    # Heuristic: find containers with multiple children containing dates
    date_re = re.compile(r"\\b\\d{1,2}/\\d{1,2}/\\d{4}\\b")
    candidates = []

    for elem in soup.find_all(True):
        text = elem.get_text(" ", strip=True)
        if date_re.search(text):
            candidates.append(elem)

    # pick ancestor with multiple similar items
    if candidates:
        # choose the element that appears most often by tag+class
        counts: Dict[str, int] = {}
        for elem in candidates:
            sel = _css_from_tag_and_class(elem.name, elem.get("class", []))
            counts[sel] = counts.get(sel, 0) + 1
        result_item = max(counts, key=counts.get)
        guess.result_item = result_item

        # now find a sample item
        sample = soup.select_one(result_item)
        if sample:
            # title: prefer link or heading
            link = sample.find("a", href=True)
            if link:
                guess.result_link = _css_from_tag_and_class(link.name, link.get("class", []))
                guess.result_title = guess.result_link
            heading = sample.find(re.compile("^h[1-6]$"))
            if heading:
                guess.result_title = _css_from_tag_and_class(heading.name, heading.get("class", []))

            # date element: first element containing date
            date_elem = None
            for child in sample.find_all(True):
                if date_re.search(child.get_text(" ", strip=True)):
                    date_elem = child
                    break
            if date_elem:
                guess.result_date = _css_from_tag_and_class(date_elem.name, date_elem.get("class", []))

            # description: first paragraph-like element
            desc = sample.find("p")
            if desc:
                guess.result_description = _css_from_tag_and_class(desc.name, desc.get("class", []))

    # pagination: look for "Siguiente"
    next_link = soup.find("a", string=re.compile(r"Siguiente|>|»", re.IGNORECASE))
    if next_link:
        guess.next_page_selector = _css_from_tag_and_class(next_link.name, next_link.get("class", []))

    return guess


def _build_config(url: str, guess: SelectorGuess) -> Dict:
    selectors: Dict[str, object] = {
        "result_item": guess.result_item,
        "result_title": guess.result_title,
        "result_date": guess.result_date,
        "result_link": guess.result_link,
        "result_description": guess.result_description,
        "result_organization": guess.result_organization,
        "timezone": "America/Argentina/Mendoza",
        "business_days_window": 4,
    }
    selectors = {k: v for k, v in selectors.items() if v}

    pagination: Dict[str, object] = {
        "search_url": url,
        "date_from_param": guess.date_from_name,
        "date_to_param": guess.date_to_name,
        "date_format": "%d/%m/%Y",
        "next_page_selector": guess.next_page_selector,
    }
    pagination = {k: v for k, v in pagination.items() if v}

    return {
        "name": "Boletin Oficial Mendoza",
        "url": url,
        "active": True,
        "schedule": "0 7,13,19 * * 1-5",
        "selectors": selectors,
        "pagination": pagination,
        "headers": {},
        "cookies": {},
        "wait_time": 1.0,
        "max_items": None,
        "source_type": "website",
    }


def main() -> int:
    url = DEFAULT_URL
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    # Prefer Selenium Manager to download a compatible driver instead of using PATH
    driver_path = None
    try:
        driver_path = SeleniumManager().binary_paths("chrome").get("driver_path")
    except Exception:
        driver_path = None

    # Remove Homebrew chromedriver from PATH if present to avoid version mismatch
    path_parts = os.environ.get("PATH", "").split(":")
    path_parts = [p for p in path_parts if p != "/opt/homebrew/bin"]
    os.environ["PATH"] = ":".join(path_parts)

    service = Service(executable_path=driver_path) if driver_path else Service()
    driver = webdriver.Chrome(options=options, service=service)
    driver.set_page_load_timeout(60)

    try:
        driver.get(url)
        # Wait for page to render and the search form to be present
        WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.TAG_NAME, "form"))
        )

        # If the form type select exists, choose a non-empty option to reveal more fields
        selected_value = None
        try:
            form_type = driver.find_element(By.NAME, "formType")
            select = Select(form_type)
            preferred = ["normaForm", "boeForm", "edictoForm"]
            options = [(opt.get_attribute("value") or "").strip() for opt in select.options]
            for pref in preferred:
                if pref in options:
                    select.select_by_value(pref)
                    selected_value = pref
                    break
            if not selected_value:
                for opt in select.options:
                    val = (opt.get_attribute("value") or "").strip()
                    if val and val.lower() != "0":
                        select.select_by_value(val)
                        selected_value = val
                        break
        except Exception:
            pass

        # Try to discover date inputs by labels
        guess = SelectorGuess()
        date_from = _find_date_input(driver, "Fecha publicada desde")
        date_to = _find_date_input(driver, "Fecha publicada hasta")
        if date_from:
            guess.date_from_name = date_from[0]
        if date_to:
            guess.date_to_name = date_to[0]

        # Fill date range and submit search
        try:
            dates = _last_business_days(4)
            script = """
            const name = arguments[0];
            const value = arguments[1];
            const el = document.querySelector(`input[name='${name}']`);
            if (el) {
              el.removeAttribute('readonly');
              el.removeAttribute('disabled');
              el.value = value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
            """
            if selected_value == "boeForm":
                driver.execute_script(script, "boeFecha", dates[-1])
            else:
                driver.execute_script(script, "fechaPublicadaDesde", dates[0])
                driver.execute_script(script, "fechaPublicadaHasta", dates[-1])
        except Exception:
            pass

        # Submit search
        try:
            submit = driver.find_element(By.XPATH, "//button[contains(., 'Consultar')]")
            submit.click()
        except Exception:
            pass

        # Wait for results to load
        time.sleep(5)

        html = driver.page_source
        OUTPUT_HTML.write_text(html, encoding="utf-8")

        html_guess = _guess_selectors_from_html(html)
        # merge guesses
        for field in html_guess.__dataclass_fields__:
            val = getattr(html_guess, field)
            if val and not getattr(guess, field):
                setattr(guess, field, val)

        config = _build_config(url, guess)
        OUTPUT_CONFIG.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")

        print(f"Wrote HTML: {OUTPUT_HTML}")
        print(f"Wrote config: {OUTPUT_CONFIG}")
        print("Selector guesses:", json.dumps(config.get("selectors", {}), ensure_ascii=False, indent=2))
        print("Pagination guesses:", json.dumps(config.get("pagination", {}), ensure_ascii=False, indent=2))
        return 0
    finally:
        driver.quit()


if __name__ == "__main__":
    raise SystemExit(main())
