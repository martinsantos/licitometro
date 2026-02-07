"""
Municipality Procurement Source Discovery Tool

Probes URL patterns for Mendoza municipalities, validates procurement content,
detects recommended scraper type, and outputs a JSON + console report.

Usage:
  python3 scripts/discover_sources.py                          # all targets
  python3 scripts/discover_sources.py --municipality Tunuyan   # specific one
  python3 scripts/discover_sources.py --all                    # include already-active sources

Docker:
  docker exec -w /app -e PYTHONPATH=/app backend python3 scripts/discover_sources.py
"""

import asyncio
import aiohttp
import argparse
import json
import logging
import re
import sys
from datetime import datetime
from typing import List, Dict, Optional
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("discover")

# Keywords indicating procurement content (min 2 matches = positive)
PROCUREMENT_KEYWORDS = [
    "licitaci", "pliego", "apertura", "contrataci",
    "presupuesto oficial", "adjudicaci", "compra directa",
    "concurso de precios", "expediente", "compulsa",
]

# Common procurement page URL suffixes
PROCUREMENT_PATHS = [
    "/licitaciones/",
    "/licitaciones-publicas/",
    "/compras/",
    "/compras-y-contrataciones/",
    "/compras-y-licitaciones/",
    "/transparencia/licitaciones/",
    "/transparencia/",
    "/portal-de-transparencia/",
    "/gobierno-abierto/licitaciones/",
    "/concursos-y-licitaciones/",
    "/informacion-publica/licitaciones/",
    "/informacion-publica/licitaciones-2/",
]

# All Mendoza municipalities + entities with known/candidate domains
TARGETS = [
    {
        "name": "Tunuyan",
        "cuc": 617,
        "domains": ["tunuyan.gov.ar", "tunuyan.gob.ar", "munitunuyan.gob.ar"],
        "known_urls": ["https://www.tunuyan.gov.ar/site/licitaciones"],
        "status": "failed",  # 404 on known URL
        "notes": "Has InfoGov supplier portal (requires login)",
    },
    {
        "name": "La Paz",
        "cuc": 606,
        "domains": ["lapazmendoza.gob.ar", "lapaz.gob.ar", "munilapaz.gob.ar"],
        "known_urls": ["https://lapazmendoza.gob.ar/licitaciones/"],
        "status": "failed",  # WAF challenge
        "notes": "OpenResty WAF blocks non-browser requests",
    },
    {
        "name": "San Carlos",
        "cuc": 613,
        "domains": ["sancarlos.gob.ar", "munisancarlos.gob.ar"],
        "known_urls": ["https://sancarlos.gob.ar/licitaciones-msc/"],
        "status": "needs_config",  # Works but not configured
        "notes": "229 items, 3 pages, WordPress/Elementor",
    },
    {
        "name": "San Rafael",
        "cuc": 615,
        "domains": ["sanrafael.gov.ar", "sanrafael.gob.ar"],
        "known_urls": ["https://www.sanrafael.gov.ar/informacion-publica/licitaciones-2/"],
        "status": "redirect",  # Redirects to Mendoza Compra
        "notes": "Just links to mendoza.gov.ar/compras/mendoza-compra/ (CUC 615)",
    },
    {
        "name": "Maipu",
        "cuc": 610,
        "domains": ["maipu.gob.ar", "munimaipu.gob.ar"],
        "known_urls": ["https://www.maipu.gob.ar/compras-y-licitaciones/"],
        "status": "needs_config",  # Works with 240+ items
        "notes": "240+ items, single page table, WordPress",
    },
    {
        "name": "San Martin",
        "cuc": 614,
        "domains": ["sanmartinmza.gob.ar", "sanmartin.gob.ar"],
        "known_urls": ["https://sanmartinmza.gob.ar/licitaciones/"],
        "status": "redirect",  # Points to Mendoza Compra CUC 614
        "notes": "Directs users to search CUC 614 in Mendoza Compra",
    },
    {
        "name": "Irrigacion",
        "cuc": None,
        "domains": ["irrigacion.gov.ar"],
        "known_urls": [
            "https://serviciosweb.cloud.irrigacion.gov.ar/public/licitaciones/licitacion",
            "https://compras.irrigacion.gov.ar/",
        ],
        "status": "failed",
        "notes": "JHipster SPA at serviciosweb.cloud. API microservice broken (/services/licitaciones/api/ returns error). compras.irrigacion.gov.ar ECONNREFUSED.",
    },
    {
        "name": "EMESA",
        "cuc": None,
        "domains": ["emesa.com.ar"],
        "known_urls": ["https://emesa.com.ar/licitaciones/"],
        "status": "failed",  # WAF
        "notes": "OpenResty WAF with webdriver/headless detection",
    },
    {
        "name": "Lujan de Cuyo",
        "cuc": 609,
        "domains": ["lujandecuyo.gob.ar"],
        "known_urls": ["https://licitaciones.lujandecuyo.gob.ar/"],
        "status": "unknown",
        "notes": "Dedicated subdomain for licitaciones",
    },
]

# Already active sources (skip unless --all)
ACTIVE_SOURCES = {
    "Ciudad de Mendoza", "General Alvear", "Godoy Cruz", "Guaymallen",
    "Junin", "Las Heras", "Lavalle", "Malargue", "Rivadavia",
    "Santa Rosa", "Tupungato", "EPRE",
}

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"


async def probe_url(session: aiohttp.ClientSession, url: str) -> Dict:
    """Probe a single URL and analyze its content."""
    result = {
        "url": url,
        "status": None,
        "accessible": False,
        "has_procurement": False,
        "scraper_type": None,
        "title": None,
        "item_count_hint": 0,
        "error": None,
    }
    try:
        async with session.get(url, allow_redirects=True, ssl=False) as resp:
            result["status"] = resp.status
            result["final_url"] = str(resp.url)

            if resp.status != 200:
                return result

            html = await resp.text(errors="replace")
            result["accessible"] = True
            text_lower = html.lower()

            # Check for WAF/challenge pages
            if "please wait while your request is being verified" in text_lower:
                result["scraper_type"] = "selenium_stealth"
                result["has_procurement"] = True  # behind WAF
                result["error"] = "WAF challenge detected"
                return result

            # Check procurement keywords
            kw_count = sum(1 for kw in PROCUREMENT_KEYWORDS if kw in text_lower)
            result["has_procurement"] = kw_count >= 2

            # Detect scraper type
            result["scraper_type"] = _detect_scraper_type(html, url)

            # Extract title
            soup = BeautifulSoup(html, "html.parser")
            title_el = soup.find("title")
            if title_el:
                result["title"] = title_el.get_text(strip=True)[:100]

            # Rough item count hints
            tables = soup.find_all("table")
            for t in tables:
                rows = len(t.find_all("tr"))
                if rows > result["item_count_hint"]:
                    result["item_count_hint"] = rows

            articles = soup.find_all("article")
            if len(articles) > result["item_count_hint"]:
                result["item_count_hint"] = len(articles)

            # Check for Jet Engine grid items
            jet_items = soup.select(".jet-listing-grid__item")
            if len(jet_items) > result["item_count_hint"]:
                result["item_count_hint"] = len(jet_items)

    except asyncio.TimeoutError:
        result["error"] = "Timeout"
    except aiohttp.ClientConnectorError as e:
        result["error"] = f"Connection error: {e}"
    except Exception as e:
        result["error"] = str(e)[:200]

    return result


def _detect_scraper_type(html: str, url: str) -> str:
    """Recommend scraper type based on page structure."""
    lower = html.lower()

    # React SPA
    if any(s in lower for s in ["react", "bundle.js", "__next_data__", "root"]) and \
       "<table" not in lower and "<article" not in lower:
        return "api_scraper"

    # Oracle APEX
    if "oracle" in lower and "apex" in lower:
        return "selenium_apex"

    # WAF challenges
    if "openresty" in lower or "please wait while your request is being verified" in lower:
        return "selenium_stealth"

    # WordPress/Elementor
    if "wp-content" in lower or "wordpress" in lower or "elementor" in lower:
        return "generic_html"

    # Standard HTML with tables
    if "<table" in lower:
        return "generic_html"

    return "generic_html"


async def discover_municipality(session: aiohttp.ClientSession, target: Dict) -> Dict:
    """Discover procurement sources for a municipality."""
    name = target["name"]
    logger.info(f"--- {name} ---")

    findings = {
        "municipality": name,
        "cuc": target.get("cuc"),
        "known_status": target.get("status", "unknown"),
        "known_notes": target.get("notes", ""),
        "probed": [],
        "best_url": None,
    }

    # Probe known URLs first
    for url in target.get("known_urls", []):
        result = await probe_url(session, url)
        findings["probed"].append(result)
        logger.info(f"  {url} -> {result['status']} accessible={result['accessible']} procurement={result['has_procurement']} scraper={result['scraper_type']} items~{result['item_count_hint']} err={result.get('error')}")

        if result["accessible"] and result["has_procurement"] and not findings["best_url"]:
            findings["best_url"] = result

    # Probe URL patterns for each domain
    for domain in target.get("domains", []):
        for path in PROCUREMENT_PATHS:
            for prefix in ["https://www.", "https://"]:
                url = f"{prefix}{domain}{path}"
                # Skip if we already found a good source or already probed
                if findings["best_url"] and findings["best_url"].get("error") is None:
                    break
                if any(p["url"] == url for p in findings["probed"]):
                    continue

                result = await probe_url(session, url)
                findings["probed"].append(result)

                if result["accessible"] and result["has_procurement"]:
                    logger.info(f"  FOUND: {url} -> scraper={result['scraper_type']} items~{result['item_count_hint']}")
                    if not findings["best_url"] or (findings["best_url"].get("error") and not result.get("error")):
                        findings["best_url"] = result

                # Small delay between probes
                await asyncio.sleep(0.3)

    if findings["best_url"]:
        logger.info(f"  BEST: {findings['best_url']['url']} ({findings['best_url']['scraper_type']})")
    else:
        logger.warning(f"  NO procurement source found for {name}")

    return findings


async def run_discovery(targets: List[Dict]):
    """Run discovery for all targets."""
    timeout = aiohttp.ClientTimeout(total=20, connect=10)
    headers = {"User-Agent": UA}

    async with aiohttp.ClientSession(timeout=timeout, headers=headers) as session:
        all_findings = []
        for target in targets:
            findings = await discover_municipality(session, target)
            all_findings.append(findings)

    # Report
    report = {
        "timestamp": datetime.utcnow().isoformat(),
        "municipalities": all_findings,
        "summary": {
            "total": len(all_findings),
            "found": sum(1 for f in all_findings if f["best_url"]),
            "waf_blocked": sum(1 for f in all_findings if f["best_url"] and f["best_url"].get("error")),
            "not_found": sum(1 for f in all_findings if not f["best_url"]),
        },
    }

    print("\n" + "=" * 80)
    print("SOURCE DISCOVERY REPORT")
    print("=" * 80)
    for f in all_findings:
        best = f["best_url"]
        if best:
            status = "WAF" if best.get("error") else "OK"
            url = best["url"]
            scraper = best["scraper_type"]
            items = best["item_count_hint"]
            print(f"  {f['municipality']:20s} [{status:4s}] {url}")
            print(f"  {'':20s}        scraper={scraper} items~{items}")
        else:
            print(f"  {f['municipality']:20s} [FAIL] {f['known_notes']}")
    print("=" * 80)
    s = report["summary"]
    print(f"Total: {s['total']} | Found: {s['found']} | WAF: {s['waf_blocked']} | Not found: {s['not_found']}")

    # Save JSON
    out_path = "scripts/discover_sources_report.json"
    with open(out_path, "w") as fp:
        json.dump(report, fp, indent=2, default=str, ensure_ascii=False)
    print(f"\nJSON report saved to: {out_path}")


def main():
    parser = argparse.ArgumentParser(description="Discover procurement sources for Mendoza municipalities")
    parser.add_argument("--municipality", "-m", help="Run for a specific municipality only")
    parser.add_argument("--all", action="store_true", help="Include already-active sources")
    args = parser.parse_args()

    targets = TARGETS
    if args.municipality:
        targets = [t for t in TARGETS if t["name"].lower() == args.municipality.lower()]
        if not targets:
            print(f"Municipality '{args.municipality}' not found in targets list.")
            print(f"Available: {', '.join(t['name'] for t in TARGETS)}")
            sys.exit(1)

    asyncio.run(run_discovery(targets))


if __name__ == "__main__":
    main()
