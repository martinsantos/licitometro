#!/usr/bin/env python3
"""Backfill adjudicaciones directly from OCDS JSON downloads (all 3 periods).

Bypasses the licitaciones pipeline — downloads full OCDS JSONs from
datosabiertos-compras.mendoza.gov.ar and upserts all awards directly into
db.adjudicaciones. Idempotent by dedup_key.

This captures ~16,000+ historical awards from 2020-2026 in a single run.

Usage:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \\
      python3 scripts/backfill_adjudicaciones_from_ocds_api.py [--dry-run]
"""
import asyncio
import argparse
import os
import re
import ssl
import sys
from datetime import datetime
from pathlib import Path

import aiohttp
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

from services.adjudicacion_service import get_adjudicacion_service
from utils.time import utc_now

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")
DATASETS_URL = "https://datosabiertos-compras.mendoza.gov.ar/datasets/"
BASE_URL = "https://datosabiertos-compras.mendoza.gov.ar"


def _parse_ocds_date(raw):
    if not raw:
        return None
    s = str(raw).strip()
    s = re.sub(r"Z$", "", s)
    s = re.sub(r"[+-]\d{2}:\d{2}$", "", s)
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _extract_from_release(release):
    """Return a list of adjudicacion dicts — one per supplier per award."""
    tender = release.get("tender") or {}
    planning = release.get("planning") or {}
    buyer = release.get("buyer") or {}
    parties = release.get("parties") or []

    ocid = release.get("ocid") or ""
    title = tender.get("title") or ""
    description = tender.get("description") or ""
    objeto = title[:200] if title else (description[:200] if description else None)
    organization = buyer.get("name") or "Gobierno de Mendoza"
    proc_method = tender.get("procurementMethod") or ""
    proc_method_detail = tender.get("procurementMethodDetails") or proc_method

    budget_original = None
    budget_data = (planning.get("budget") or {}).get("amount") or {}
    if budget_data.get("amount"):
        try:
            budget_original = float(budget_data["amount"])
        except (ValueError, TypeError):
            pass
    currency = budget_data.get("currency") or "ARS"

    # Parties lookup: id → parsed party (to get CUIT from identifier.id)
    party_by_id = {p.get("id"): p for p in parties if p.get("id")}

    results = []
    awards = release.get("awards") or []

    for award_idx, award in enumerate(awards):
        status = award.get("status") or "active"
        if status not in ("active", "pending"):
            continue

        award_value = (award.get("value") or {}).get("amount")
        try:
            monto = float(award_value) if award_value is not None else None
        except (ValueError, TypeError):
            monto = None

        fecha = _parse_ocds_date(award.get("date"))

        suppliers = award.get("suppliers") or []
        num_oferentes = len(suppliers)

        for supplier in suppliers:
            name = (supplier.get("name") or "").strip()
            if not name:
                continue

            # Try to get CUIT from parties list
            cuit = None
            supplier_id = supplier.get("id")
            if supplier_id and supplier_id in party_by_id:
                party = party_by_id[supplier_id]
                identifiers = party.get("additionalIdentifiers") or []
                for ident in identifiers:
                    if ident.get("scheme") in ("AR-CUIT", "CUIT") and ident.get("id"):
                        cuit = re.sub(r"[\-\.\s]", "", str(ident["id"]))
                        break
                if not cuit:
                    main_ident = party.get("identifier") or {}
                    if main_ident.get("scheme") in ("AR-CUIT", "CUIT") and main_ident.get("id"):
                        cuit = re.sub(r"[\-\.\s]", "", str(main_ident["id"]))

            results.append({
                "proceso_id": None,
                "licitacion_id": None,
                "ocds_ocid": ocid,
                "expedient_number": None,
                "licitacion_number": None,
                "adjudicatario": name,
                "supplier_id": cuit,
                "monto_adjudicado": monto,
                "currency": currency,
                "fecha_adjudicacion": fecha,
                "estado_adjudicacion": "active" if status == "active" else status,
                "objeto": objeto,
                "organization": organization,
                "category": None,  # OCDS doesn't map to our rubros — leave null
                "tipo_procedimiento": proc_method_detail,
                "budget_original": budget_original,
                "num_oferentes": num_oferentes if num_oferentes > 1 else None,
                "fuente": "ocds_mendoza",
                "fecha_ingesta": utc_now(),
                "extraction_confidence": 1.0,
                "metadata": {
                    "ocds_method": proc_method,
                    "award_id": award.get("id"),
                    "award_idx": award_idx,
                    "release_id": release.get("id"),
                },
            })

    return results


async def _find_json_urls():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    async with aiohttp.ClientSession(
        connector=aiohttp.TCPConnector(ssl=ctx),
        timeout=aiohttp.ClientTimeout(total=60),
    ) as s:
        async with s.get(DATASETS_URL) as r:
            html = await r.text()

    soup = BeautifulSoup(html, "html.parser")
    urls = []
    for a in soup.find_all("a", href=True):
        h = a["href"]
        if "descargar-json" in h and h.endswith(".json"):
            full = h if h.startswith("http") else f"{BASE_URL}{h}"
            urls.append(full)
    return urls


async def _download_json(session, url):
    import json as _json
    async with session.get(url) as r:
        if r.status != 200:
            print(f"  HTTP {r.status} on {url}")
            return None
        raw = await r.read()
    try:
        return _json.loads(raw)
    except Exception as e:
        print(f"  JSON parse error on {url}: {e}")
        return None


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit-per-file", type=int, default=0)
    args = parser.parse_args()

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    svc = get_adjudicacion_service(db)
    if not args.dry_run:
        await svc.ensure_indexes()

    urls = await _find_json_urls()
    print(f"Found {len(urls)} OCDS JSON files on datasets page")

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    stats = {"files": 0, "releases": 0, "awards_extracted": 0, "upserted": 0, "errors": 0}

    async with aiohttp.ClientSession(
        connector=aiohttp.TCPConnector(ssl=ctx),
        timeout=aiohttp.ClientTimeout(total=300),
    ) as session:
        for url in urls:
            print(f"\nDownloading {url.split('/')[-1]}…")
            data = await _download_json(session, url)
            if not data:
                continue

            releases = data.get("releases") or []
            stats["files"] += 1
            stats["releases"] += len(releases)
            print(f"  {len(releases)} releases")

            processed = 0
            for release in releases:
                if args.limit_per_file and processed >= args.limit_per_file:
                    break
                processed += 1
                try:
                    extractions = _extract_from_release(release)
                except Exception as e:
                    stats["errors"] += 1
                    if stats["errors"] <= 3:
                        print(f"  extraction error: {e}")
                    continue

                for adj in extractions:
                    stats["awards_extracted"] += 1
                    dedup_key = svc.compute_dedup_key(
                        fuente="ocds_mendoza",
                        ocds_ocid=adj["ocds_ocid"],
                        adjudicatario=adj["adjudicatario"],
                        fecha=adj["fecha_adjudicacion"],
                        monto=adj["monto_adjudicado"],
                    )
                    adj["dedup_key"] = dedup_key

                    if args.dry_run:
                        if stats["upserted"] < 5:
                            print(
                                f"  [dry-run] {adj['adjudicatario'][:50]} | "
                                f"${adj['monto_adjudicado']} | {adj['fecha_adjudicacion']}"
                            )
                        stats["upserted"] += 1
                        continue

                    try:
                        await svc.upsert(adj)
                        stats["upserted"] += 1
                    except Exception as e:
                        stats["errors"] += 1
                        if stats["errors"] <= 3:
                            print(f"  upsert error: {e}")

                if stats["awards_extracted"] % 1000 == 0 and stats["awards_extracted"] > 0:
                    print(f"  progress: extracted={stats['awards_extracted']} upserted={stats['upserted']}")

    print("\n--- Final stats ---")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    if not args.dry_run:
        total = await db.adjudicaciones.count_documents({})
        by_fuente = await db.adjudicaciones.count_documents({"fuente": "ocds_mendoza"})
        unique = len(await db.adjudicaciones.distinct("adjudicatario"))
        print(f"\nadjudicaciones total: {total}")
        print(f"  ocds_mendoza: {by_fuente}")
        print(f"  unique suppliers: {unique}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
