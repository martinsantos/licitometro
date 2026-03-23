from fastapi import APIRouter, Query, Request
from typing import List, Optional
from datetime import date, datetime, timedelta
import logging

from utils.filter_builder import build_base_filters

logger = logging.getLogger("licitaciones_stats_router")

router = APIRouter(
    prefix="/api/licitaciones",
    tags=["licitaciones-stats"],
    responses={404: {"description": "Not found"}}
)


@router.get("/stats/daily-counts")
async def get_daily_counts(
    days: int = Query(14, ge=1, le=30),
    fecha_campo: str = Query("publication_date"),
    q: Optional[str] = Query(None),
    fuente: Optional[str] = None,
    category: Optional[str] = None,
    workflow_state: Optional[str] = None,
    nodo: Optional[str] = None,
    estado: Optional[str] = None,
    organization: Optional[str] = None,
    status: Optional[str] = None,
    jurisdiccion: Optional[str] = None,
    tipo_procedimiento: Optional[str] = None,
    budget_min: Optional[float] = None,
    budget_max: Optional[float] = None,
    year: Optional[str] = None,
    only_national: Optional[bool] = Query(False),
    fuente_exclude: Optional[List[str]] = Query(None),
    estado_exclude: Optional[List[str]] = Query(None, description="Exclude items with these estado values"),
    request: Request = None,
):
    """Get count of licitaciones per day for the last N days, respecting listing filters."""

    allowed_date_fields = ["publication_date", "opening_date", "expiration_date",
                           "fecha_publicacion_portal", "fecha_inicio_consultas", "fecha_fin_consultas",
                           "created_at", "fecha_scraping", "first_seen_at"]
    if fecha_campo not in allowed_date_fields:
        fecha_campo = "publication_date"

    db = request.app.mongodb
    collection = db.licitaciones

    start_date = datetime.combine(date.today() - timedelta(days=days - 1), datetime.min.time())

    # Build match from listing filters (excluding date range — the strip computes its own)
    match_stage = build_base_filters(
        fuente=fuente,
        organization=organization,
        status=status,
        category=category,
        workflow_state=workflow_state,
        jurisdiccion=jurisdiccion,
        tipo_procedimiento=tipo_procedimiento,
        nodo=nodo,
        estado=estado,
        budget_min=budget_min,
        budget_max=budget_max,
        fecha_campo=fecha_campo,
        year=year,
        only_national=bool(only_national),
        fuente_exclude=fuente_exclude or None,
        q=q,
    )

    # Override date range: always last N days on fecha_campo
    match_stage[fecha_campo] = {"$gte": start_date}

    # Extra: exclude estado values (separate from estado filter)
    if estado_exclude:
        if "estado" in match_stage:
            # Merge with existing estado filter via $and
            match_stage.setdefault("$and", []).append({"estado": {"$nin": estado_exclude}})
        else:
            match_stage["estado"] = {"$nin": estado_exclude}

    pipeline = [
        {"$match": match_stage},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": f"${fecha_campo}"}},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]

    results = await collection.aggregate(pipeline).to_list(length=days + 1)
    counts = {r["_id"]: r["count"] for r in results}

    return {
        "days": days,
        "fecha_campo": fecha_campo,
        "counts": counts,
    }


@router.get("/stats/data-quality")
async def get_data_quality_stats(
    only_national: Optional[bool] = Query(False, description="Only Argentina nacional sources (~11 sources)"),
    jurisdiccion: Optional[str] = Query(None, description="Filter by jurisdiccion"),
    request: Request = None
):
    """Get data quality statistics: completeness by source, opening_date coverage, duplicates"""
    db = request.app.mongodb
    collection = db.licitaciones

    # Build match filter for jurisdiction/source
    base_match = {}
    if only_national:
        base_match["tags"] = "LIC_AR"
    elif jurisdiccion:
        base_match["jurisdiccion"] = jurisdiccion

    # Records by source
    pipeline_stages = []
    if base_match:
        pipeline_stages.append({"$match": base_match})

    pipeline_stages.extend([
        {"$group": {
            "_id": "$fuente",
            "total": {"$sum": 1},
            "with_opening_date": {
                "$sum": {"$cond": [{"$ifNull": ["$opening_date", False]}, 1, 0]}
            },
            "with_description": {
                "$sum": {"$cond": [{"$and": [
                    {"$ne": ["$description", None]},
                    {"$ne": ["$description", ""]}
                ]}, 1, 0]}
            },
            "with_budget": {
                "$sum": {"$cond": [{"$ifNull": ["$budget", False]}, 1, 0]}
            },
            "with_content_hash": {
                "$sum": {"$cond": [{"$ifNull": ["$content_hash", False]}, 1, 0]}
            },
            "decretos": {
                "$sum": {"$cond": [{"$eq": ["$tipo", "decreto"]}, 1, 0]}
            },
        }},
        {"$sort": {"total": -1}}
    ])

    by_source = await collection.aggregate(pipeline_stages).to_list(length=50)

    total = sum(r["total"] for r in by_source)
    total_with_opening = sum(r["with_opening_date"] for r in by_source)

    # Potential duplicates: same content_hash appearing more than once
    dup_hashes = await collection.aggregate([
        {"$match": {"content_hash": {"$ne": None}}},
        {"$group": {"_id": "$content_hash", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$count": "duplicate_groups"}
    ]).to_list(length=1)
    duplicate_groups = dup_hashes[0]["duplicate_groups"] if dup_hashes else 0

    sources = []
    for r in by_source:
        t = r["total"]
        sources.append({
            "fuente": r["_id"] or "Desconocida",
            "total": t,
            "with_opening_date": r["with_opening_date"],
            "opening_date_pct": round(r["with_opening_date"] / t * 100, 1) if t else 0,
            "with_description": r["with_description"],
            "with_budget": r["with_budget"],
            "decretos": r["decretos"],
        })

    return {
        "total_records": total,
        "total_with_opening_date": total_with_opening,
        "opening_date_pct": round(total_with_opening / total * 100, 1) if total else 0,
        "duplicate_groups": duplicate_groups,
        "by_source": sources,
    }


@router.get("/stats/url-quality")
async def get_url_quality_stats(
    request: Request
):
    """Get statistics about URL quality across all licitaciones"""
    db = request.app.mongodb
    collection = db.licitaciones

    pipeline = [
        {"$group": {"_id": "$url_quality", "count": {"$sum": 1}}}
    ]

    results = await collection.aggregate(pipeline).to_list(length=10)
    total = sum(r["count"] for r in results)

    return {
        "total": total,
        "by_quality": {r["_id"] or "unknown": r["count"] for r in results},
        "percentages": {
            r["_id"] or "unknown": round(r["count"] / total * 100, 2) if total > 0 else 0
            for r in results
        }
    }


@router.get("/stats/recent-activity")
async def get_recent_activity(
    hours: int = Query(24, ge=1, le=168),
    request: Request = None,
):
    """Get recent scraping activity: new licitaciones grouped by source"""
    db = request.app.mongodb
    collection = db.licitaciones

    since = datetime.utcnow() - timedelta(hours=hours)

    pipeline = [
        {"$match": {"first_seen_at": {"$gte": since}}},
        {"$sort": {"first_seen_at": -1}},
        {"$group": {
            "_id": "$fuente",
            "count": {"$sum": 1},
            "latest": {"$first": "$first_seen_at"},
            "sample_titles": {"$push": "$title"},
        }},
        {"$sort": {"count": -1}}
    ]

    results = await collection.aggregate(pipeline).to_list(length=50)
    total_new = sum(r["count"] for r in results)

    by_source = []
    for r in results:
        by_source.append({
            "fuente": r["_id"] or "Desconocida",
            "count": r["count"],
            "latest": r["latest"].isoformat() if r["latest"] else None,
            "sample_titles": r["sample_titles"][:3],
        })

    return {
        "hours": hours,
        "total_new": total_new,
        "by_source": by_source,
    }


@router.get("/stats/scraping-activity")
async def get_scraping_activity(
    request: Request,
    hours: int = 24,
    only_national: Optional[bool] = Query(False, description="Only Argentina nacional sources"),
    fuente_exclude: Optional[List[str]] = Query(None, description="Exclude these sources"),
):
    """Get categorized scraping activity: truly new, re-indexed, and updated items"""
    db = request.app.mongodb
    collection = db.licitaciones

    since = datetime.utcnow() - timedelta(hours=hours)

    # Build jurisdiction filter
    jurisdiction_filter: dict = {}
    if only_national:
        jurisdiction_filter["tags"] = "LIC_AR"
    else:
        jurisdiction_filter["tags"] = {"$ne": "LIC_AR"}
    if fuente_exclude:
        jurisdiction_filter["fuente"] = {"$nin": fuente_exclude}

    # Count truly new items (first_seen_at >= since)
    truly_new_pipeline = [
        {"$match": {"first_seen_at": {"$gte": since}, **jurisdiction_filter}},
        {"$group": {
            "_id": "$fuente",
            "count": {"$sum": 1}
        }}
    ]
    truly_new_results = await collection.aggregate(truly_new_pipeline).to_list(100)
    truly_new_by_source = {r["_id"]: r["count"] for r in truly_new_results}
    total_truly_new = sum(truly_new_by_source.values())

    # Count re-indexed items (fecha_scraping >= since AND first_seen_at < since)
    re_indexed_pipeline = [
        {"$match": {
            **jurisdiction_filter,
            "fecha_scraping": {"$gte": since},
            "$or": [
                {"first_seen_at": {"$lt": since}},
                {"first_seen_at": {"$exists": False}}
            ]
        }},
        {"$group": {
            "_id": "$fuente",
            "count": {"$sum": 1}
        }}
    ]
    re_indexed_results = await collection.aggregate(re_indexed_pipeline).to_list(100)
    re_indexed_by_source = {r["_id"]: r["count"] for r in re_indexed_results}
    total_re_indexed = sum(re_indexed_by_source.values())

    # Count updated items (updated_at >= since AND created_at < since AND fecha_scraping < since)
    updated_pipeline = [
        {"$match": {
            **jurisdiction_filter,
            "updated_at": {"$gte": since},
            "created_at": {"$lt": since},
            "$or": [
                {"fecha_scraping": {"$lt": since}},
                {"fecha_scraping": {"$exists": False}}
            ]
        }},
        {"$group": {
            "_id": "$fuente",
            "count": {"$sum": 1}
        }}
    ]
    updated_results = await collection.aggregate(updated_pipeline).to_list(100)
    updated_by_source = {r["_id"]: r["count"] for r in updated_results}
    total_updated = sum(updated_by_source.values())

    # Combine all sources
    all_sources = set(truly_new_by_source.keys()) | set(re_indexed_by_source.keys()) | set(updated_by_source.keys())
    by_source = []
    for source in sorted(all_sources):
        by_source.append({
            "fuente": source or "Desconocida",
            "truly_new": truly_new_by_source.get(source, 0),
            "re_indexed": re_indexed_by_source.get(source, 0),
            "updated": updated_by_source.get(source, 0)
        })

    # Sort by total activity
    by_source.sort(key=lambda x: x["truly_new"] + x["re_indexed"] + x["updated"], reverse=True)

    return {
        "hours": hours,
        "truly_new": total_truly_new,
        "re_indexed": total_re_indexed,
        "updated": total_updated,
        "by_source": by_source
    }


@router.get("/stats/truly-new-count")
async def get_truly_new_count(
    since_date: date = Query(..., description="Count items where first_seen_at >= this date"),
    only_national: Optional[bool] = Query(False, description="Only Argentina nacional sources"),
    fuente_exclude: Optional[List[str]] = Query(None, description="Exclude these sources"),
    request: Request = None
):
    """Return count of items truly discovered since given date.

    This endpoint provides accurate count for "Nuevas de hoy" badge,
    independent of pagination and current filter state.
    """
    db = request.app.mongodb
    collection = db.licitaciones

    # Convert date to datetime for MongoDB comparison
    since_datetime = datetime.combine(since_date, datetime.min.time())

    # Build jurisdiction filter
    jf: dict = {}
    if only_national:
        jf["tags"] = "LIC_AR"
    else:
        jf["tags"] = {"$ne": "LIC_AR"}
    if fuente_exclude:
        jf["fuente"] = {"$nin": fuente_exclude}

    count = await collection.count_documents({
        "first_seen_at": {"$gte": since_datetime},
        **jf,
    })

    # Optional: breakdown by source for debugging
    pipeline = [
        {"$match": {"first_seen_at": {"$gte": since_datetime}, **jf}},
        {"$group": {"_id": "$fuente", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]

    by_source = []
    async for doc in collection.aggregate(pipeline):
        by_source.append({"fuente": doc["_id"] or "Desconocida", "count": doc["count"]})

    return {
        "total": count,
        "since": since_date.isoformat(),
        "top_sources": by_source
    }


@router.get("/stats/year-range")
async def get_year_range(request: Request):
    """Get min/max publication years for dynamic year selector"""
    db = request.app.mongodb
    collection = db.licitaciones

    pipeline = [
        {"$match": {"publication_date": {"$ne": None}}},
        {"$group": {
            "_id": None,
            "min_date": {"$min": "$publication_date"},
            "max_date": {"$max": "$publication_date"}
        }}
    ]

    result = await collection.aggregate(pipeline).to_list(1)

    if not result or not result[0].get("min_date") or not result[0].get("max_date"):
        current_year = datetime.now().year
        return {"min_year": current_year, "max_year": current_year}

    min_year = result[0]["min_date"].year
    max_year = result[0]["max_date"].year

    return {"min_year": min_year, "max_year": max_year}


@router.get("/stats/storage")
async def get_storage_stats(request: Request):
    """Get storage usage statistics: MongoDB collections, indexes, disk, and growth projections."""
    import bson
    db = request.app.mongodb

    # --- MongoDB per-collection stats ---
    db_stats = await db.command("dbStats")
    collection_names = await db.list_collection_names()
    collections = []
    for coll_name in sorted(collection_names):
        try:
            cs = await db.command("collStats", coll_name)
            collections.append({
                "name": coll_name,
                "documents": cs.get("count", 0),
                "data_kb": round(cs.get("size", 0) / 1024, 1),
                "index_kb": round(cs.get("totalIndexSize", 0) / 1024, 1),
                "avg_doc_bytes": round(cs.get("avgObjSize", 0)),
            })
        except Exception:
            pass

    total_data_kb = round(db_stats.get("dataSize", 0) / 1024, 1)
    total_index_kb = round(db_stats.get("indexSize", 0) / 1024, 1)
    total_kb = total_data_kb + total_index_kb

    # --- Largest licitaciones (top 5) ---
    largest = []
    cursor = db.licitaciones.find().sort("enrichment_level", -1).limit(10)
    docs = await cursor.to_list(length=10)
    for doc in docs:
        size = len(bson.BSON.encode(doc))
        largest.append({
            "title": (doc.get("title") or "")[:60],
            "size_bytes": size,
            "enrichment_level": doc.get("enrichment_level", 1),
            "attached_files": len(doc.get("attached_files", [])),
            "fuente": doc.get("fuente"),
        })
    largest.sort(key=lambda x: x["size_bytes"], reverse=True)
    largest = largest[:5]

    # --- Enrichment level distribution (treat None as level 1) ---
    enrichment_dist = await db.licitaciones.aggregate([
        {"$group": {
            "_id": {"$ifNull": ["$enrichment_level", 1]},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}}
    ]).to_list(length=10)

    # --- Size by enrichment level ---
    size_by_enrichment = {}
    for level_data in enrichment_dist:
        level = level_data["_id"] or 1
        sample_cursor = db.licitaciones.find(
            {"$or": [{"enrichment_level": level}, {"enrichment_level": None}]}
            if level == 1 else {"enrichment_level": level}
        ).limit(20)
        sample_docs = await sample_cursor.to_list(length=20)
        if sample_docs:
            sizes = [len(bson.BSON.encode(d)) for d in sample_docs]
            avg_size = sum(sizes) / len(sizes)
            size_by_enrichment[str(level)] = {
                "count": level_data["count"],
                "avg_doc_bytes": round(avg_size),
                "total_estimated_kb": round(avg_size * level_data["count"] / 1024, 1),
            }

    # --- Disk storage ---
    from services.storage_cleanup_service import STORAGE_DIR, STORAGE_MAX_MB
    disk_mb = 0.0
    disk_files = 0
    if STORAGE_DIR.exists():
        for f in STORAGE_DIR.rglob("*"):
            if f.is_file():
                disk_mb += f.stat().st_size
                disk_files += 1
        disk_mb = round(disk_mb / (1024 * 1024), 2)

    # --- Growth projection ---
    lic_count = await db.licitaciones.count_documents({})
    runs_count = await db.scraper_runs.count_documents({})

    # Average doc size across all licitaciones
    avg_lic_bytes = 0
    if lic_count > 0:
        lic_coll = next((c for c in collections if c["name"] == "licitaciones"), None)
        if lic_coll:
            avg_lic_bytes = lic_coll["avg_doc_bytes"]

    # Projection: if we add 50 licitaciones/week, how much growth per month?
    weekly_new = 50  # estimate
    monthly_new = weekly_new * 4
    monthly_growth_kb = round(monthly_new * avg_lic_bytes / 1024, 1)

    # Projected sizes at milestones
    projections = {}
    for target in [500, 1000, 5000, 10000]:
        proj_data_kb = round(target * avg_lic_bytes / 1024, 1)
        proj_index_kb = round(total_index_kb * (target / max(lic_count, 1)), 1)
        projections[str(target)] = {
            "data_kb": proj_data_kb,
            "index_kb": proj_index_kb,
            "total_mb": round((proj_data_kb + proj_index_kb) / 1024, 1),
        }

    return {
        "mongodb": {
            "total_data_kb": total_data_kb,
            "total_index_kb": total_index_kb,
            "total_kb": total_kb,
            "total_mb": round(total_kb / 1024, 2),
            "collections": collections,
        },
        "disk": {
            "storage_dir_mb": disk_mb,
            "storage_files": disk_files,
            "max_mb": STORAGE_MAX_MB,
            "usage_pct": round(disk_mb / STORAGE_MAX_MB * 100, 1) if STORAGE_MAX_MB > 0 else 0,
        },
        "licitaciones": {
            "total": lic_count,
            "avg_doc_bytes": avg_lic_bytes,
            "largest": largest,
            "by_enrichment_level": size_by_enrichment,
            "enrichment_distribution": [
                {"level": e["_id"] or 1, "count": e["count"]} for e in enrichment_dist
            ],
        },
        "scraper_runs": {
            "total": runs_count,
        },
        "growth_projection": {
            "avg_doc_bytes": avg_lic_bytes,
            "estimated_weekly_new": weekly_new,
            "monthly_growth_kb": monthly_growth_kb,
            "at_milestones": projections,
        },
    }


@router.get("/stats/estado-distribution")
async def get_estado_distribution(
    request: Request,
    jurisdiccion: Optional[str] = Query(None, description="Filter by jurisdiction"),
    only_national: Optional[bool] = Query(False, description="Only show Argentina nacional sources")
):
    """
    Return counts by estado + year.

    Example response:
    {
        "by_estado": {
            "vigente": 245,
            "vencida": 1203,
            "prorrogada": 12,
            "archivada": 3156
        },
        "by_year": {
            "2024": 1890,
            "2025": 2301,
            "2026": 425
        },
        "vigentes_hoy": 245
    }
    """
    db = request.app.mongodb

    # Build base match filter
    base_match = {}
    if only_national:
        base_match["tags"] = "LIC_AR"
    elif jurisdiccion:
        base_match["jurisdiccion"] = jurisdiccion

    # Count by estado
    estado_pipeline = [
        {"$match": base_match} if base_match else {"$match": {}},
        {"$group": {"_id": "$estado", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}}
    ]
    estado_result = await db.licitaciones.aggregate(estado_pipeline).to_list(100)
    by_estado = {doc["_id"]: doc["count"] for doc in estado_result}

    # Count by publication year
    year_match = {**base_match, "publication_date": {"$exists": True, "$ne": None}}
    year_pipeline = [
        {"$match": year_match},
        {"$group": {"_id": {"$year": "$publication_date"}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}}
    ]
    year_result = await db.licitaciones.aggregate(year_pipeline).to_list(100)
    by_year = {str(doc["_id"]): doc["count"] for doc in year_result}

    # Count vigentes hoy (vigente + prorrogada, with future or missing opening_date)
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    vigentes_filter = {
        **base_match,
        "estado": {"$in": ["vigente", "prorrogada"]},
        "$or": [
            {"opening_date": {"$gte": today}},
            {"opening_date": None}
        ]
    }
    vigentes_count = await db.licitaciones.count_documents(vigentes_filter)

    return {
        "by_estado": by_estado,
        "by_year": by_year,
        "vigentes_hoy": vigentes_count
    }
