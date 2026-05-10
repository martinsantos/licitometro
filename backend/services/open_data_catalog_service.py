"""Admin helpers for discovering and wiring Datos Argentina CKAN datasets."""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

import aiohttp

from utils.time import utc_now

logger = logging.getLogger("open_data_catalog")

CKAN_BASE = "https://datos.gob.ar/api/3/action"


class OpenDataCatalogService:
    def __init__(self, db):
        self.db = db

    async def search_catalog(self, q: str = "Contrataciones", *, rows: int = 20) -> Dict[str, Any]:
        rows = max(1, min(int(rows or 20), 50))
        params = {"q": q or "Contrataciones", "rows": rows}
        data = await self._get_json(f"{CKAN_BASE}/package_search", params=params)
        result = data.get("result", {}) if data.get("success") else {}
        packages = []
        for pkg in result.get("results", []) or []:
            resources = []
            for res in pkg.get("resources", []) or []:
                fmt = (res.get("format") or "").lower()
                if fmt and fmt not in ("csv", "json", "xlsx", "xls", "xml", "zip", "ods"):
                    continue
                resources.append({
                    "id": res.get("id"),
                    "name": res.get("name") or res.get("description") or fmt,
                    "format": fmt,
                    "datastore_active": bool(res.get("datastore_active")),
                    "last_modified": res.get("last_modified"),
                    "url": res.get("url"),
                })
            packages.append({
                "id": pkg.get("name") or pkg.get("id"),
                "title": pkg.get("title"),
                "organization": (pkg.get("organization") or {}).get("title", ""),
                "notes": pkg.get("notes", ""),
                "url": pkg.get("url") or f"https://datos.gob.ar/dataset/{pkg.get('name', '')}",
                "resources": resources,
                "resource_count": len(resources),
                "datastore_resources": sum(1 for r in resources if r["datastore_active"]),
                "last_modified": pkg.get("metadata_modified"),
            })
        return {
            "query": q,
            "total": result.get("count", len(packages)),
            "items": packages,
        }

    async def upsert_dataset_config(
        self,
        *,
        dataset_id: str,
        max_items: int = 200,
        active: bool = True,
        run_now: bool = True,
    ) -> Dict[str, Any]:
        dataset_id = (dataset_id or "").strip()
        if not dataset_id:
            raise ValueError("dataset_id required")
        max_items = max(1, min(int(max_items or 200), 2000))
        package = await self._package_show(dataset_id)
        name = f"datos_argentina_{_slug(dataset_id)}"
        now = utc_now()
        config_doc = {
            "name": name,
            "url": f"https://datos.gob.ar/dataset/{dataset_id}",
            "active": active,
            "schedule": "0 8 * * 1-5",
            "selectors": {"dataset_id": dataset_id, "scraper_type": "datos_argentina"},
            "source_type": "api",
            "max_items": max_items,
            "wait_time": 1.0,
            "scope": "ar_nacional",
            "metadata": {
                "catalog_title": package.get("title"),
                "catalog_modified": package.get("metadata_modified"),
            },
            "updated_at": now,
        }
        await self.db.scraper_configs.update_one(
            {"name": name},
            {"$set": config_doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )

        run_id = None
        if run_now:
            try:
                from services.scheduler_service import get_scheduler_service

                scheduler = get_scheduler_service(self.db)
                run_id = await scheduler.trigger_scraper_now(name)
            except Exception as exc:
                logger.warning("Could not trigger datos Argentina scraper %s: %s", name, exc)
        return {
            "ok": True,
            "config_name": name,
            "dataset_id": dataset_id,
            "run_id": run_id,
            "triggered": bool(run_id),
        }

    async def _package_show(self, dataset_id: str) -> Dict[str, Any]:
        data = await self._get_json(f"{CKAN_BASE}/package_show", params={"id": dataset_id})
        if not data.get("success"):
            raise ValueError(f"CKAN dataset not found: {dataset_id}")
        return data.get("result", {})

    async def _get_json(self, url: str, *, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        from services.service_resilience import run_with_retry

        async def _request() -> Dict[str, Any]:
            timeout = aiohttp.ClientTimeout(total=30, connect=10, sock_read=20)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url, params=params, ssl=False) as response:
                    response.raise_for_status()
                    return await response.json(content_type=None)

        return await run_with_retry("datos_argentina_ckan", _request)


def _slug(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_")[:60]


def get_open_data_catalog_service(db) -> OpenDataCatalogService:
    return OpenDataCatalogService(db)
