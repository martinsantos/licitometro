"""
Auto-update service: daily re-enrichment of active licitaciones.
Runs as a scheduled job at 8:00 AM, re-scraping licitaciones that are
actively being evaluated or prepared (workflow_state in evaluando/preparando)
with future opening dates.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import aiohttp

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorDatabase
from models.licitacion import LicitacionUpdate

logger = logging.getLogger("auto_update_service")

_instance = None


class AutoUpdateService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db["licitaciones"]

    async def run_auto_update(self) -> Dict[str, Any]:
        """Run auto-update on active licitaciones with future opening dates."""
        logger.info("Starting auto-update of active licitaciones...")

        now = datetime.utcnow()

        # Query: workflow_state in [evaluando, preparando] AND opening_date >= today
        query = {
            "workflow_state": {"$in": ["evaluando", "preparando"]},
            "$or": [
                {"opening_date": {"$gte": now}},
                {"opening_date": None}  # Also update those without opening_date set
            ]
        }

        cursor = self.collection.find(query)
        candidates = await cursor.to_list(length=100)

        stats = {
            "total_candidates": len(candidates),
            "updated": 0,
            "skipped": 0,
            "errors": 0,
            "changes_detected": [],
            "started_at": now.isoformat(),
        }

        logger.info(f"Found {len(candidates)} active licitaciones to check")

        for lic_doc in candidates:
            try:
                lic_id = str(lic_doc["_id"])
                fuente = lic_doc.get("fuente", "")

                # Take snapshot of key fields before enrichment
                before_snapshot = self._take_snapshot(lic_doc)

                # Run enrichment (COMPR.AR uses specialized logic, others use generic)
                if "COMPR.AR" in fuente:
                    success = await self._enrich_licitacion(lic_doc)
                else:
                    success = await self._enrich_generic(lic_doc)

                if not success:
                    stats["skipped"] += 1
                    continue

                # Get updated doc
                updated_doc = await self.collection.find_one({"_id": lic_doc["_id"]})
                if not updated_doc:
                    continue

                after_snapshot = self._take_snapshot(updated_doc)
                changes = self._detect_changes(before_snapshot, after_snapshot)

                # Update auto-update tracking fields
                auto_update_entry = {
                    "timestamp": now.isoformat(),
                    "changes": changes,
                    "fields_changed": len(changes),
                }

                update_fields = {
                    "last_auto_update": now,
                }

                # Append to auto_update_changes array
                await self.collection.update_one(
                    {"_id": lic_doc["_id"]},
                    {
                        "$set": update_fields,
                        "$push": {"auto_update_changes": auto_update_entry}
                    }
                )

                if changes:
                    stats["changes_detected"].append({
                        "id": lic_id,
                        "changes": changes,
                    })

                stats["updated"] += 1
                logger.info(f"Auto-updated {lic_id}: {len(changes)} changes detected")

                # Rate limit - don't overwhelm the source
                await asyncio.sleep(2)

            except Exception as e:
                stats["errors"] += 1
                logger.error(f"Error auto-updating {lic_doc.get('_id')}: {e}")

        stats["finished_at"] = datetime.utcnow().isoformat()
        logger.info(f"Auto-update complete: {stats['updated']} updated, {stats['skipped']} skipped, {stats['errors']} errors")

        return stats

    def _take_snapshot(self, doc: dict) -> dict:
        """Take a snapshot of fields we care about for change detection."""
        fields = [
            "opening_date", "fecha_publicacion_portal", "fecha_inicio_consultas",
            "fecha_fin_consultas", "etapa", "modalidad", "items", "circulares",
            "garantias", "pliegos_bases", "requisitos_participacion",
            "actos_administrativos", "solicitudes_contratacion", "attached_files",
            "enrichment_level", "document_count", "description",
        ]
        return {f: doc.get(f) for f in fields}

    def _detect_changes(self, before: dict, after: dict) -> List[str]:
        """Compare before/after snapshots and return list of changed field names."""
        changes = []
        for key in set(list(before.keys()) + list(after.keys())):
            bval = before.get(key)
            aval = after.get(key)
            # Handle list comparison
            if isinstance(bval, list) and isinstance(aval, list):
                if len(bval) != len(aval):
                    changes.append(key)
            elif bval != aval:
                changes.append(key)
        return changes

    async def _enrich_licitacion(self, lic_doc: dict) -> bool:
        """Run enrichment on a single licitacion. Returns True if successful."""
        try:
            metadata = lic_doc.get("metadata", {}) or {}

            # Build URL list (same priority as comprar.py endpoint)
            urls_to_try = []

            pliego_url = metadata.get("comprar_pliego_url")
            if pliego_url:
                urls_to_try.append(("pliego", pliego_url))

            source_url = str(lic_doc.get("source_url", "") or "")
            if source_url and "VistaPreviaPliegoCiudadano" in source_url:
                if source_url not in [u[1] for u in urls_to_try]:
                    urls_to_try.append(("pliego", source_url))

            if source_url and "ComprasElectronicas.aspx" in source_url:
                urls_to_try.append(("compras", source_url))

            detail_url = metadata.get("comprar_detail_url")
            if detail_url and "ComprasElectronicas" in str(detail_url):
                if detail_url not in [u[1] for u in urls_to_try]:
                    urls_to_try.append(("compras", detail_url))

            canonical_url = str(lic_doc.get("canonical_url", "") or "")
            if canonical_url:
                if "VistaPreviaPliegoCiudadano" in canonical_url:
                    if canonical_url not in [u[1] for u in urls_to_try]:
                        urls_to_try.append(("pliego", canonical_url))
                elif "ComprasElectronicas" in canonical_url:
                    if canonical_url not in [u[1] for u in urls_to_try]:
                        urls_to_try.append(("compras", canonical_url))

            if not urls_to_try:
                return False

            # Fetch HTML
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
            }

            page_html = None
            url_type = None

            async with aiohttp.ClientSession(headers=headers) as session:
                for url_kind, url in urls_to_try:
                    try:
                        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30), ssl=False) as resp:
                            if resp.status == 200:
                                html = await resp.text()
                                if len(html) > 1000 and ("CPH1" in html or "ContentPlaceHolder" in html or "Cronograma" in html):
                                    page_html = html
                                    url_type = url_kind
                                    break
                    except Exception:
                        continue

            if not page_html:
                return False

            # Parse
            from scrapers.mendoza_compra import MendozaCompraScraper
            from utils.dates import parse_date_guess
            scraper = MendozaCompraScraper(config={})
            parsed_data = scraper._parse_pliego_fields(page_html)

            # Build update dict (same logic as comprar.py)
            update_data = {}

            date_mappings = {
                "Fecha y hora estimada de publicación en el portal": "fecha_publicacion_portal",
                "Fecha y hora inicio de consultas": "fecha_inicio_consultas",
                "Fecha y hora final de consultas": "fecha_fin_consultas",
                "Fecha y hora acto de apertura": "opening_date",
            }

            for parsed_key, field_name in date_mappings.items():
                if parsed_data.get(parsed_key):
                    val = parse_date_guess(parsed_data[parsed_key])
                    if val:
                        update_data[field_name] = val

            simple_mappings = {
                "Etapa": "etapa",
                "Modalidad": "modalidad",
                "Alcance": "alcance",
                "Encuadre legal": "encuadre_legal",
                "Tipo de cotización": "tipo_cotizacion",
                "Tipo de adjudicación": "tipo_adjudicacion",
                "Duración del contrato": "duracion_contrato",
            }

            for parsed_key, field_name in simple_mappings.items():
                if parsed_data.get(parsed_key):
                    update_data[field_name] = parsed_data[parsed_key]

            list_mappings = {
                "_items": "items",
                "_solicitudes": "solicitudes_contratacion",
                "_pliegos_bases": "pliegos_bases",
                "_requisitos_participacion": "requisitos_participacion",
                "_actos_administrativos": "actos_administrativos",
                "_circulares": "circulares",
                "_garantias": "garantias",
            }

            for parsed_key, field_name in list_mappings.items():
                if parsed_data.get(parsed_key):
                    update_data[field_name] = parsed_data[parsed_key]

            # Files
            all_files = []
            if parsed_data.get("_attached_files"):
                all_files.extend(parsed_data["_attached_files"])
            if parsed_data.get("_anexos"):
                for a in parsed_data["_anexos"]:
                    all_files.append({
                        "name": f"ANEXO: {a.get('nombre', '')} - {a.get('descripcion', '')}".strip(),
                        "url": a.get("link", ""),
                        "type": "anexo",
                        "metadata": a,
                    })
            if all_files:
                update_data["attached_files"] = all_files

            # Enrichment tracking
            update_data["enrichment_level"] = 2
            update_data["last_enrichment"] = datetime.utcnow()
            if update_data.get("attached_files"):
                update_data["document_count"] = len(update_data["attached_files"])

            # Update metadata
            update_data["metadata"] = {
                **metadata,
                "enriched_at": datetime.utcnow().isoformat(),
                "enriched_from_url": urls_to_try[0][1] if urls_to_try else None,
                "enriched_url_type": url_type,
                "auto_updated": True,
                "last_auto_update": datetime.utcnow().isoformat(),
            }

            # Auto-classify category if missing (title-first to avoid boilerplate noise)
            if not lic_doc.get("category") and not update_data.get("category"):
                from services.category_classifier import get_category_classifier
                classifier = get_category_classifier()
                title = lic_doc.get("title", "")
                cat = classifier.classify(title=title)
                if not cat:
                    desc = (update_data.get("description", lic_doc.get("description", "")) or "")[:500]
                    cat = classifier.classify(title=title, description=desc)
                if cat:
                    update_data["category"] = cat

            # Promote budget if extracted during enrichment
            if not lic_doc.get("budget") and not update_data.get("budget"):
                meta = update_data.get("metadata", metadata) or {}
                if meta.get("budget_extracted"):
                    update_data["budget"] = meta["budget_extracted"]
                    if not lic_doc.get("currency"):
                        update_data["currency"] = "ARS"

            # Save to MongoDB
            if update_data:
                await self.collection.update_one(
                    {"_id": lic_doc["_id"]},
                    {"$set": update_data}
                )
                return True

            return False

        except Exception as e:
            logger.error(f"Enrichment error for {lic_doc.get('_id')}: {e}")
            return False

    async def _enrich_generic(self, lic_doc: dict) -> bool:
        """Run generic enrichment for non-COMPR.AR licitaciones."""
        try:
            source_url = str(lic_doc.get("source_url", "") or "")
            if not source_url:
                return False

            # Look up scraper config for CSS selectors
            fuente = lic_doc.get("fuente", "")
            selectors = None
            import re
            config_doc = await self.db.scraper_configs.find_one({
                "name": {"$regex": re.escape(fuente), "$options": "i"},
                "active": True,
            })
            if config_doc:
                selectors = config_doc.get("selectors", {})

            from services.generic_enrichment import GenericEnrichmentService
            service = GenericEnrichmentService()
            updates = await service.enrich(lic_doc, selectors)

            if not updates:
                return False

            current_level = lic_doc.get("enrichment_level", 1)
            if current_level < 2:
                updates["enrichment_level"] = 2

            # Auto-classify category if missing (title-first to avoid boilerplate noise)
            if not lic_doc.get("category") and not updates.get("category"):
                from services.category_classifier import get_category_classifier
                classifier = get_category_classifier()
                title = lic_doc.get("title", "")
                cat = classifier.classify(title=title)
                if not cat:
                    desc = (updates.get("description", lic_doc.get("description", "")) or "")[:500]
                    cat = classifier.classify(title=title, description=desc)
                if cat:
                    updates["category"] = cat

            # Promote budget if extracted during enrichment
            if not lic_doc.get("budget") and not updates.get("budget"):
                meta = updates.get("metadata", lic_doc.get("metadata", {})) or {}
                if meta.get("budget_extracted"):
                    updates["budget"] = meta["budget_extracted"]
                    if not lic_doc.get("currency"):
                        updates["currency"] = "ARS"

            metadata = lic_doc.get("metadata", {}) or {}
            updates["metadata"] = {
                **metadata,
                "auto_updated": True,
                "last_auto_update": datetime.utcnow().isoformat(),
            }

            await self.collection.update_one(
                {"_id": lic_doc["_id"]},
                {"$set": updates}
            )
            return True

        except Exception as e:
            logger.error(f"Generic enrichment error for {lic_doc.get('_id')}: {e}")
            return False


def get_auto_update_service(db: AsyncIOMotorDatabase) -> AutoUpdateService:
    """Get or create singleton AutoUpdateService instance."""
    global _instance
    if _instance is None:
        _instance = AutoUpdateService(db)
    return _instance
