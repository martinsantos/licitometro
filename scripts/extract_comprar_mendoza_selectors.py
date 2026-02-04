#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

from bs4 import BeautifulSoup

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.selenium_manager import SeleniumManager
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
except Exception as exc:
    print("Selenium not available.", file=sys.stderr)
    raise

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_LIST_HTML = ROOT / "docs" / "comprar_mendoza_list.html"
OUTPUT_DETAIL_HTML = ROOT / "docs" / "comprar_mendoza_detail.html"
OUTPUT_CONFIG = ROOT / "docs" / "comprar_mendoza_scraper_config.json"

DEFAULT_URL = "https://comprar.mendoza.gov.ar/"


@dataclass
class SelectorGuess:
    links: Optional[str] = None
    title: Optional[str] = None
    organization: Optional[str] = None
    publication_date: Optional[str] = None
    opening_date: Optional[str] = None
    expedient_number: Optional[str] = None
    licitacion_number: Optional[str] = None
    description: Optional[str] = None
    contact: Optional[str] = None
    attached_files: Optional[str] = None
    next_page_selector: Optional[str] = None


def _css_from_tag_and_class(tag: str, classes: list[str]) -> str:
    classes = [c for c in classes if c]
    if not classes:
        return tag
    return tag + "".join(f".{c}" for c in classes)


def _guess_list_selectors(html: str) -> SelectorGuess:
    soup = BeautifulSoup(html, "html.parser")
    guess = SelectorGuess()

    # Look for links that seem to be detail links
    link_candidates = []
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        text = a.get_text(" ", strip=True)
        if re.search(r"detalle|ver|expediente|licit", text, re.IGNORECASE):
            link_candidates.append(a)
        if re.search(r"/Compras/servlet/|/servlet/", href, re.IGNORECASE):
            link_candidates.append(a)

    if link_candidates:
        a = link_candidates[0]
        guess.links = _css_from_tag_and_class(a.name, a.get("class", []))
    else:
        # try data-href or onclick patterns
        for el in soup.find_all(True):
            data_href = el.get("data-href") or el.get("data-url")
            onclick = el.get("onclick", "")
            if data_href and re.search(r"servlet|detalle|licit", data_href, re.IGNORECASE):
                guess.links = _css_from_tag_and_class(el.name, el.get("class", []))
                break
            if onclick and re.search(r"servlet|detalle|licit", onclick, re.IGNORECASE):
                guess.links = _css_from_tag_and_class(el.name, el.get("class", []))
                break

    # Pagination
    next_link = soup.find("a", string=re.compile(r"Siguiente|>|»", re.IGNORECASE))
    if next_link:
        guess.next_page_selector = _css_from_tag_and_class(next_link.name, next_link.get("class", []))

    return guess


def _guess_detail_selectors(html: str) -> SelectorGuess:
    soup = BeautifulSoup(html, "html.parser")
    guess = SelectorGuess()

    # Title
    title = soup.find(re.compile("^h[1-3]$"))
    if title:
        guess.title = _css_from_tag_and_class(title.name, title.get("class", []))

    # Generic fields
    labels = {
        "organization": ["Organismo", "Entidad", "Organismo contratante"],
        "publication_date": ["Fecha de Publicación", "Fecha publicación", "Publicado"],
        "opening_date": ["Fecha de Apertura", "Apertura"],
        "expedient_number": ["Expediente", "N° Expediente"],
        "licitacion_number": ["Licitación", "N° Licitación", "Número"],
        "description": ["Objeto", "Descripción", "Detalle"],
        "contact": ["Contacto", "Consultas"],
    }

    for key, terms in labels.items():
        for term in terms:
            label = soup.find(string=re.compile(term, re.IGNORECASE))
            if label:
                # try parent or next sibling
                node = label.parent
                if node:
                    guess.__dict__[key] = _css_from_tag_and_class(node.name, node.get("class", []))
                break

    # Attached files
    file_link = soup.find("a", href=True, string=re.compile(r"pdf|pliego|descargar", re.IGNORECASE))
    if file_link:
        guess.attached_files = _css_from_tag_and_class(file_link.name, file_link.get("class", []))

    return guess


def _build_config(guess_list: SelectorGuess, guess_detail: SelectorGuess) -> Dict:
    selectors = {
        "links": guess_list.links or "a",
        "title": guess_detail.title or "h1",
        "organization": guess_detail.organization or "div.organismo",
        "publication_date": guess_detail.publication_date or "div.fecha-publicacion",
        "opening_date": guess_detail.opening_date or "div.fecha-apertura",
        "expedient_number": guess_detail.expedient_number or "div.expediente",
        "licitacion_number": guess_detail.licitacion_number or "div.numero-licitacion",
        "description": guess_detail.description or "div.descripcion",
        "contact": guess_detail.contact or "div.contacto",
        "attached_files": guess_detail.attached_files or "a",
    }
    selectors = {k: v for k, v in selectors.items() if v}

    pagination = {
        "next_page_selector": guess_list.next_page_selector or "a.next-page",
    }
    return {
        "name": "COMPR.AR Mendoza",
        "url": DEFAULT_URL,
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

    try:
        driver_path = SeleniumManager().binary_paths("chrome").get("driver_path")
    except Exception:
        driver_path = None

    # remove homebrew chromedriver
    path_parts = os.environ.get("PATH", "").split(":")
    path_parts = [p for p in path_parts if p != "/opt/homebrew/bin"]
    os.environ["PATH"] = ":".join(path_parts)

    service = Service(executable_path=driver_path) if driver_path else Service()

    with webdriver.Chrome(options=options, service=service) as driver:
        driver.set_page_load_timeout(60)
        driver.get(url)
        time.sleep(5)

        # Try to click "Procesos con apertura en los últimos 30 días"
        try:
            target = driver.find_element(By.ID, "ctl00_CPH1_CtrlConsultasFrecuentes_btnProcesoCompraTreintaDias")
            target.click()
            time.sleep(6)
        except Exception:
            # fallback by text
            try:
                links = driver.find_elements(By.TAG_NAME, "a")
                for a in links:
                    text = (a.text or "").strip()
                    if re.search(r"últimos 30 días", text, re.IGNORECASE):
                        a.click()
                        time.sleep(6)
                        break
            except Exception:
                pass

        # attempt to find a listing link
        html = driver.page_source
        OUTPUT_LIST_HTML.write_text(html, encoding="utf-8")
        list_guess = _guess_list_selectors(html)

        detail_html = ""
        try:
            # click first process link from grid
            anchors = driver.find_elements(By.TAG_NAME, "a")
            target = None
            for a in anchors:
                href = a.get_attribute("href") or ""
                if "__doPostBack" in href and "GridListaPliegos" in href:
                    target = a
                    break
            if target:
                target.click()
                time.sleep(6)
                detail_html = driver.page_source
                OUTPUT_DETAIL_HTML.write_text(detail_html, encoding="utf-8")
        except Exception:
            pass

        detail_guess = _guess_detail_selectors(detail_html) if detail_html else SelectorGuess()

        config = _build_config(list_guess, detail_guess)
        OUTPUT_CONFIG.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote list HTML: {OUTPUT_LIST_HTML}")
        if detail_html:
            print(f"Wrote detail HTML: {OUTPUT_DETAIL_HTML}")
        print(f"Wrote config: {OUTPUT_CONFIG}")
        print("Selectors:", json.dumps(config.get("selectors", {}), ensure_ascii=False, indent=2))
        print("Pagination:", json.dumps(config.get("pagination", {}), ensure_ascii=False, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
