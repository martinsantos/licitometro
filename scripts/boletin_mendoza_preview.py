#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import List, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup


API_URL = "https://portalgateway.mendoza.gov.ar/api/boe/advance-search"
OUTPUT = Path("storage/boletin_mendoza_preview.json")


def last_business_days(count: int) -> List[date]:
    days: List[date] = []
    current = date.today()
    while len(days) < count:
        if current.weekday() < 5:
            days.append(current)
        current -= timedelta(days=1)
    return sorted(days)


def parse_date_guess(text: str) -> Optional[datetime]:
    text = text.strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def fetch_results(keyword: str, date_from: str, date_to: str) -> str:
    payload = {
        "tipo_busqueda": "NORMA",
        "tipo_boletin": "2",
        "fechaPubDes": date_from,
        "fechaPubHas": date_to,
        "texto": keyword,
    }
    data = urlencode(payload).encode("utf-8")
    req = Request(API_URL, data=data, method="POST")
    with urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def parse_html(html: str, keyword: str) -> List[dict]:
    soup = BeautifulSoup(html, "html.parser")
    items = soup.select("table#list-table tbody tr.toggle-head")
    results = []
    for row in items:
        cols = row.find_all("td")
        if len(cols) < 5:
            continue
        tipo = cols[0].get_text(strip=True)
        norma = cols[1].get_text(strip=True)
        fec_pub = cols[3].get_text(strip=True)
        boletin_col = cols[4]
        boletin_num = boletin_col.get_text(strip=True)
        link = boletin_col.find("a", href=True)
        boletin_link = link.get("href") if link else None
        pub_dt = parse_date_guess(fec_pub)
        details_row = row.find_next_sibling("tr", class_="toggle-body")
        description = None
        organization = "Boletin Oficial Mendoza"
        if details_row:
            details_text = details_row.get_text(" ", strip=True)
            description = details_text[:1000] if details_text else None
            origin_match = re.search(r"Origen:\\s*([A-ZÁÉÍÓÚÑ0-9 ,.-]+)", details_text or "")
            if origin_match:
                organization = origin_match.group(1).strip()
        results.append(
            {
                "title": f"{tipo} {norma}".strip(),
                "publication_date": pub_dt.isoformat() if pub_dt else None,
                "boletin_number": boletin_num,
                "source_url": boletin_link,
                "organization": organization,
                "keyword": keyword,
                "description": description,
            }
        )
    return results


def main() -> int:
    keywords = [
        "licitacion",
        "licitación",
        "contratacion",
        "contratación",
        "concurso",
        "convocatoria",
        "compulsa",
        "comparacion de precios",
        "adjudicacion",
        "adjudicación",
    ]
    days = last_business_days(4)
    date_from = days[0].isoformat()
    date_to = days[-1].isoformat()

    all_results: List[dict] = []
    for kw in keywords:
        html = fetch_results(kw, date_from, date_to)
        all_results.extend(parse_html(html, kw))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(all_results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(all_results)} results to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
