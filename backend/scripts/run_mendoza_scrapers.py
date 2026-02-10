#!/usr/bin/env python3
"""
Fase 1 - Pipeline de scraping Mendoza.

Ejecuta ambos scrapers de Mendoza (COMPR.AR y Boletin Oficial),
recopila los resultados, los ordena y los guarda en:
  - JSON consolidado en storage/
  - (opcional) MongoDB si hay conexion

Uso:
  python backend/scripts/run_mendoza_scrapers.py [--no-selenium] [--output DIR]
"""

import asyncio
import argparse
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

# Ensure backend is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from scrapers.mendoza_compra import MendozaCompraScraper
from scrapers.boletin_oficial_mendoza_scraper import BoletinOficialMendozaScraper

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("mendoza_pipeline")

# ── Config loaders ──────────────────────────────────────────────────────────

DOCS_DIR = Path(__file__).parent.parent.parent / "docs"
DEFAULT_OUTPUT = Path(__file__).parent.parent.parent / "storage"


def _load_json_config(filename: str) -> dict:
    path = DOCS_DIR / filename
    if path.exists():
        with open(path) as f:
            return json.load(f)
    raise FileNotFoundError(f"Config not found: {path}")


def _comprar_config(use_selenium: bool = True) -> ScraperConfig:
    raw = _load_json_config("comprar_mendoza_scraper_config.json")
    if not use_selenium:
        raw["selectors"]["use_selenium_pliego"] = False
    return ScraperConfig(**raw)


def _boletin_config() -> ScraperConfig:
    raw = _load_json_config("boletin_mendoza_scraper_config.json")
    return ScraperConfig(**raw)


# ── Serialization ───────────────────────────────────────────────────────────

def _licitacion_to_dict(lic) -> dict:
    """Convert a LicitacionCreate to a BSON-compatible dict.
    Preserves datetime as native objects (Motor handles them natively).
    Only converts HttpUrl fields to str for BSON compatibility.
    """
    d = lic.model_dump() if hasattr(lic, "model_dump") else lic.dict()
    for url_field in ("source_url", "canonical_url"):
        if d.get(url_field) is not None:
            d[url_field] = str(d[url_field])
    return d


# ── MongoDB persistence (optional) ─────────────────────────────────────────

async def _save_to_mongodb(licitaciones: list[dict]):
    """Attempt to save to MongoDB. Silently skip if unavailable."""
    try:
        from motor.motor_asyncio import AsyncIOMotorClient

        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "licitaciones_db")
        client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=3000)
        await client.server_info()  # test connection

        db = client[db_name]
        collection = db["licitaciones"]

        inserted = 0
        skipped = 0
        for lic in licitaciones:
            existing = await collection.find_one({"id_licitacion": lic["id_licitacion"]})
            if existing:
                skipped += 1
                continue
            lic["created_at"] = datetime.utcnow()
            lic["updated_at"] = datetime.utcnow()
            await collection.insert_one(lic)
            inserted += 1

        logger.info(f"MongoDB: {inserted} insertados, {skipped} duplicados omitidos")
        client.close()
    except Exception as exc:
        logger.warning(f"MongoDB no disponible, solo se guardara JSON: {exc}")


# ── Main pipeline ───────────────────────────────────────────────────────────

async def run_pipeline(use_selenium: bool = True, output_dir: str = None):
    output_path = Path(output_dir) if output_dir else DEFAULT_OUTPUT
    output_path.mkdir(parents=True, exist_ok=True)

    all_licitaciones = []
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

    # ── 1. COMPR.AR Mendoza ──
    logger.info("=" * 60)
    logger.info("EJECUTANDO: COMPR.AR Mendoza")
    logger.info("=" * 60)
    try:
        comprar_cfg = _comprar_config(use_selenium=use_selenium)
        comprar_scraper = MendozaCompraScraper(comprar_cfg)
        comprar_results = await comprar_scraper.run()
        logger.info(f"COMPR.AR Mendoza: {len(comprar_results)} licitaciones encontradas")

        comprar_dicts = [_licitacion_to_dict(lic) for lic in comprar_results]
        all_licitaciones.extend(comprar_dicts)

        # Save individual source file
        comprar_file = output_path / f"comprar_mendoza_{timestamp}.json"
        with open(comprar_file, "w", encoding="utf-8") as f:
            json.dump(comprar_dicts, f, ensure_ascii=False, indent=2, default=str)
        logger.info(f"Guardado: {comprar_file}")

    except Exception as exc:
        logger.error(f"Error en COMPR.AR Mendoza: {exc}", exc_info=True)

    # ── 2. Boletin Oficial Mendoza ──
    logger.info("=" * 60)
    logger.info("EJECUTANDO: Boletin Oficial Mendoza")
    logger.info("=" * 60)
    try:
        boletin_cfg = _boletin_config()
        boletin_scraper = BoletinOficialMendozaScraper(boletin_cfg)
        boletin_results = await boletin_scraper.run()
        logger.info(f"Boletin Oficial: {len(boletin_results)} licitaciones encontradas")

        boletin_dicts = [_licitacion_to_dict(lic) for lic in boletin_results]
        all_licitaciones.extend(boletin_dicts)

        # Save individual source file
        boletin_file = output_path / f"boletin_mendoza_{timestamp}.json"
        with open(boletin_file, "w", encoding="utf-8") as f:
            json.dump(boletin_dicts, f, ensure_ascii=False, indent=2, default=str)
        logger.info(f"Guardado: {boletin_file}")

    except Exception as exc:
        logger.error(f"Error en Boletin Oficial: {exc}", exc_info=True)

    # ── 3. Consolidar y ordenar ──
    logger.info("=" * 60)
    logger.info("CONSOLIDANDO RESULTADOS")
    logger.info("=" * 60)

    # Deduplicar por id_licitacion
    seen = set()
    unique = []
    for lic in all_licitaciones:
        lid = lic.get("id_licitacion")
        if lid and lid not in seen:
            seen.add(lid)
            unique.append(lic)

    # Ordenar por fecha de publicacion (mas reciente primero)
    unique.sort(key=lambda x: x.get("publication_date", ""), reverse=True)

    # Save consolidated file
    consolidated_file = output_path / f"mendoza_consolidado_{timestamp}.json"
    with open(consolidated_file, "w", encoding="utf-8") as f:
        json.dump(unique, f, ensure_ascii=False, indent=2, default=str)

    # Also save a latest pointer
    latest_file = output_path / "mendoza_latest.json"
    with open(latest_file, "w", encoding="utf-8") as f:
        json.dump(unique, f, ensure_ascii=False, indent=2, default=str)

    logger.info(f"Total: {len(unique)} licitaciones unicas (de {len(all_licitaciones)} totales)")
    logger.info(f"Consolidado: {consolidated_file}")
    logger.info(f"Latest:      {latest_file}")

    # ── 4. Resumen por fuente ──
    fuentes = {}
    for lic in unique:
        f = lic.get("fuente", "desconocida")
        fuentes[f] = fuentes.get(f, 0) + 1
    for fuente, count in sorted(fuentes.items()):
        logger.info(f"  {fuente}: {count}")

    # ── 5. Persist to MongoDB if available ──
    await _save_to_mongodb(unique)

    return unique


# ── CLI ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Pipeline de scraping Mendoza - Fase 1")
    parser.add_argument(
        "--no-selenium",
        action="store_true",
        help="Deshabilitar Selenium para URLs PLIEGO (mas rapido, menos cobertura)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Directorio de salida para JSONs (default: storage/)",
    )
    args = parser.parse_args()

    results = asyncio.run(run_pipeline(
        use_selenium=not args.no_selenium,
        output_dir=args.output,
    ))
    print(f"\nPipeline completado: {len(results)} licitaciones recopiladas")


if __name__ == "__main__":
    main()
