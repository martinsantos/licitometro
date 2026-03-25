#!/usr/bin/env python3
"""
Test Firecrawl API against Licitometro target sources.

Usage:
  FIRECRAWL_API_KEY=fc-xxx python3 scripts/test_firecrawl.py
  FIRECRAWL_API_KEY=fc-xxx python3 scripts/test_firecrawl.py --url "https://custom-url.com"
"""

import asyncio
import argparse
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.firecrawl_service import FirecrawlService

# ANSI colors
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"
CYAN = "\033[96m"

# Target sources to test
TARGETS = [
    {
        "name": "Boletin Oficial Mendoza",
        "url": "https://boe.mendoza.gov.ar/",
        "type": "PDF gazette",
    },
    {
        "name": "COMPR.AR Mendoza",
        "url": "https://comprar.mendoza.gov.ar/Compras.aspx",
        "type": "ASP.NET postback",
    },
    {
        "name": "ComprasApps Mendoza",
        "url": "https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00049",
        "type": "GeneXus servlet",
    },
    {
        "name": "COMPR.AR Nacional",
        "url": "https://comprar.gob.ar/BuscarAvanzado2.aspx",
        "type": "ASP.NET (503 blocked)",
    },
    {
        "name": "Boletin Oficial Nacional",
        "url": "https://www.boletinoficial.gob.ar/seccion/tercera",
        "type": "3ra seccion",
    },
]


async def test_single(service: FirecrawlService, target: dict) -> dict:
    """Test Firecrawl on a single target."""
    name = target["name"]
    url = target["url"]
    src_type = target.get("type", "")

    result = await service.scrape(url, formats=["markdown", "links"], timeout=45)

    return {
        "name": name,
        "url": url,
        "type": src_type,
        **result,
    }


def print_results(results: list, total_duration: float):
    """Print formatted results table."""
    print(f"\n{BOLD}{'=' * 80}")
    print(f"  FIRECRAWL TEST RESULTS")
    print(f"{'=' * 80}{RESET}\n")

    for r in results:
        success = r.get("success", False)
        timing = r.get("timing_ms", 0)
        timing_s = timing / 1000

        if success:
            color = GREEN
            status = "OK"
        else:
            color = RED
            status = "FAIL"

        print(f"  {color}{BOLD}{status}{RESET}  {r['name']}")
        print(f"       {DIM}URL: {r['url']}{RESET}")
        print(f"       {DIM}Type: {r['type']}{RESET}")

        timing_color = GREEN if timing_s < 5 else (YELLOW if timing_s < 15 else RED)
        print(f"       Timing: {timing_color}{timing_s:.1f}s{RESET}")

        if success:
            summary = r.get("summary", {})
            md_len = summary.get("markdown_length", 0)
            link_count = summary.get("link_count", 0)
            title = summary.get("page_title", "")

            print(f"       Title: {CYAN}{title[:80]}{RESET}")
            print(f"       Markdown: {md_len:,} chars | Links: {link_count}")

            # Show first 200 chars of markdown as preview
            md = (r.get("data") or {}).get("markdown", "")
            if md:
                preview = md[:200].replace("\n", " ")
                print(f"       Preview: {DIM}{preview}...{RESET}")

            # Show first 5 links
            links = (r.get("data") or {}).get("links", [])
            if links:
                print(f"       Links (first 5):")
                for link in links[:5]:
                    print(f"         {DIM}- {link}{RESET}")
        else:
            error = r.get("error", "Unknown error")
            print(f"       {RED}Error: {error[:200]}{RESET}")

        print()

    # Summary
    ok = sum(1 for r in results if r.get("success"))
    fail = len(results) - ok
    mins = int(total_duration // 60)
    secs = int(total_duration % 60)

    print(f"{BOLD}{'=' * 80}")
    print(f"  SUMMARY: {GREEN}{ok} OK{RESET} / {RED}{fail} FAIL{RESET}  |  Total: {mins}m {secs}s")
    print(f"{BOLD}{'=' * 80}{RESET}\n")


async def main():
    parser = argparse.ArgumentParser(description="Test Firecrawl against licitometro sources")
    parser.add_argument("--url", type=str, default=None, help="Test a single custom URL")
    parser.add_argument("--key", type=str, default=None, help="Firecrawl API key (or set FIRECRAWL_API_KEY)")
    args = parser.parse_args()

    api_key = args.key or os.getenv("FIRECRAWL_API_KEY", "")
    if not api_key:
        print(f"{RED}Error: Set FIRECRAWL_API_KEY or pass --key{RESET}")
        sys.exit(1)

    service = FirecrawlService(api_key=api_key)

    if args.url:
        targets = [{"name": "Custom URL", "url": args.url, "type": "custom"}]
    else:
        targets = TARGETS

    print(f"\n{BOLD}Testing Firecrawl on {len(targets)} sources...{RESET}\n")

    results = []
    total_start = time.time()

    for i, target in enumerate(targets, 1):
        print(f"  [{i}/{len(targets)}] {target['name']}...", end=" ", flush=True)
        result = await test_single(service, target)
        results.append(result)

        if result.get("success"):
            print(f"{GREEN}OK{RESET} ({result['timing_ms']/1000:.1f}s)")
        else:
            print(f"{RED}FAIL{RESET} ({result.get('error', '')[:60]})")

    total_duration = time.time() - total_start
    print_results(results, total_duration)


if __name__ == "__main__":
    asyncio.run(main())
