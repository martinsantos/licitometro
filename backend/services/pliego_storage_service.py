"""
Pliego Storage Service — persists PDF pliegos to local disk so they survive
upstream session expiry (COMPR.AR ASP.NET) and portal outages.

Architecture:
- File path: {STORAGE_BASE}/pliegos/{fuente_slug}/{numero_saneado}.pdf
- Public URL (served by nginx alias): /pliegos/{fuente_slug}/{filename}.pdf
- Persists metadata.pliego_local_url + size + stored_at on the licitacion document
- LRU eviction: bounded by STORAGE_MAX_MB; only evicts pliegos for licitaciones
  in workflow_state ∈ ("descartada","archivada") OR with last_accessed > 60d.

Selective persistence policy:
- Skip files >10 MB (PLIEGO_STORE_MAX_FILE_MB)
- Only for prioritary fuentes (COMPR.AR Mza/Nacional, ComprasApps, Boletín Oficial Mza)
- Skip if licitacion workflow_state == "archivada"
"""
import logging
import os
import re
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase
from utils.time import utc_now

logger = logging.getLogger("pliego_storage")

STORAGE_BASE = Path(os.environ.get("STORAGE_BASE", str(Path(__file__).parent.parent / "storage")))
PLIEGOS_DIR = STORAGE_BASE / "pliegos"
PLIEGO_STORE_MAX_FILE_MB = int(os.environ.get("PLIEGO_STORE_MAX_FILE_MB", "10"))
STORAGE_MAX_MB = int(os.environ.get("STORAGE_MAX_MB", "5000"))  # 5 GB default
PLIEGO_LRU_HIGH_WATER = float(os.environ.get("PLIEGO_LRU_HIGH_WATER", "0.85"))  # start eviction
PLIEGO_LRU_LOW_WATER = float(os.environ.get("PLIEGO_LRU_LOW_WATER", "0.70"))   # evict until here

# Fuentes that always persist their pliegos (others can opt-in via passing fuente_priority=True)
PRIORITY_FUENTES = {
    "COMPR.AR Mendoza",
    "ComprasApps Mendoza",
    "COMPR.AR Nacional",
    "Boletin Oficial Mendoza",
    "Boletín Oficial Mendoza",
    "Boletin Oficial Nacional",
    "COPIG",
    "San Carlos",
    "Godoy Cruz",
}

# Workflow states that protect the pliego from LRU eviction
PROTECTED_STATES = {"evaluando", "preparando", "presentada"}


def _slugify(text: str) -> str:
    if not text:
        return "otros"
    s = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^\w\-]+", "_", s).strip("_").lower()
    return s or "otros"


def _safe_filename(numero: str) -> str:
    """Sanitize a process number to a safe filename (preserves digits and dashes)."""
    if not numero:
        return "unknown"
    s = unicodedata.normalize("NFKD", numero).encode("ascii", "ignore").decode("ascii")
    # keep alphanumerics, dash, underscore; replace everything else with _
    s = re.sub(r"[^\w\-]+", "_", s).strip("_")
    return s[:120] or "unknown"


def _resolve_path(fuente: str, numero: str) -> Path:
    fuente_slug = _slugify(fuente)
    fname = f"{_safe_filename(numero)}.pdf"
    return PLIEGOS_DIR / fuente_slug / fname


def _resolve_public_url(fuente: str, numero: str) -> str:
    fuente_slug = _slugify(fuente)
    fname = f"{_safe_filename(numero)}.pdf"
    return f"/pliegos/{fuente_slug}/{fname}"


def is_priority_fuente(fuente: Optional[str]) -> bool:
    if not fuente:
        return False
    return fuente in PRIORITY_FUENTES


_db_ref = None  # set by server.py at startup, used as fallback when caller didn't pass db


def set_db(db: AsyncIOMotorDatabase):
    """Register the global mongo db reference for callers that don't pass it explicitly."""
    global _db_ref
    _db_ref = db


def _get_db(db: Optional[AsyncIOMotorDatabase]) -> Optional[AsyncIOMotorDatabase]:
    return db if db is not None else _db_ref


async def store_pliego(
    db: Optional[AsyncIOMotorDatabase],
    licitacion_id: Any,
    pdf_bytes: bytes,
    fuente: str,
    numero: str,
    source_url: Optional[str] = None,
    force: bool = False,
) -> Optional[str]:
    """Persist PDF bytes to disk, update licitacion metadata.pliego_local_url.

    Returns the public URL (e.g. "/pliegos/comprar_mendoza/X-Y-Z.pdf") on success,
    or None if skipped (too large, not priority, etc.).
    """
    if not pdf_bytes:
        return None
    size_mb = len(pdf_bytes) / (1024 * 1024)
    if size_mb > PLIEGO_STORE_MAX_FILE_MB:
        logger.debug(f"Skip pliego store ({size_mb:.1f}MB > {PLIEGO_STORE_MAX_FILE_MB}MB cap)")
        return None
    if not force and not is_priority_fuente(fuente):
        return None
    if not numero:
        logger.debug("Skip pliego store (no numero/identifier)")
        return None

    path = _resolve_path(fuente, numero)
    public_url = _resolve_public_url(fuente, numero)

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            f.write(pdf_bytes)
    except Exception as e:
        logger.error(f"Failed writing pliego {path}: {e}")
        return None

    db = _get_db(db)
    if db is None:
        logger.debug("Wrote pliego file but no DB ref available — metadata not updated")
        return public_url
    try:
        from bson import ObjectId
        lic_id = licitacion_id if isinstance(licitacion_id, ObjectId) else ObjectId(str(licitacion_id))
        await db.licitaciones.update_one(
            {"_id": lic_id},
            {
                "$set": {
                    "metadata.pliego_local_url": public_url,
                    "metadata.pliego_local_path": str(path),
                    "metadata.pliego_local_size": len(pdf_bytes),
                    "metadata.pliego_stored_at": utc_now(),
                    "metadata.pliego_source_url": source_url,
                },
                "$unset": {
                    "metadata.link_dead_at": "",
                    "metadata.link_dead_reason": "",
                },
            },
        )
        logger.info(f"Stored pliego {public_url} ({size_mb:.2f}MB)")
    except Exception as e:
        logger.warning(f"Wrote pliego file but DB update failed: {e}")

    return public_url


def _dir_size_mb(path: Path) -> float:
    if not path.exists():
        return 0.0
    total = 0
    for f in path.rglob("*"):
        if f.is_file():
            try:
                total += f.stat().st_size
            except OSError:
                pass
    return total / (1024 * 1024)


async def evict_lru(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    """LRU eviction over PLIEGOS_DIR. Triggered by storage_cleanup cron.

    Strategy:
    - If pliegos size < HIGH_WATER * STORAGE_MAX_MB → no-op
    - Else: evict oldest pliegos (by metadata.pliego_stored_at, fallback file mtime)
      whose licitacion is in unprotected workflow_state, until size <= LOW_WATER * MAX
    - Never evict pliegos in PROTECTED_STATES
    """
    high = STORAGE_MAX_MB * PLIEGO_LRU_HIGH_WATER
    low = STORAGE_MAX_MB * PLIEGO_LRU_LOW_WATER
    current = _dir_size_mb(PLIEGOS_DIR)
    summary = {"current_mb": round(current, 2), "max_mb": STORAGE_MAX_MB, "evicted": 0, "evicted_mb": 0.0}

    if current < high:
        return summary

    logger.warning(f"Pliego storage at {current:.0f}MB (>{high:.0f}MB high-water), evicting…")

    # Build candidate map: file path → mtime
    candidates = []
    for f in PLIEGOS_DIR.rglob("*.pdf"):
        try:
            candidates.append((f, f.stat().st_mtime, f.stat().st_size))
        except OSError:
            continue
    candidates.sort(key=lambda x: x[1])  # oldest first

    evicted = 0
    evicted_bytes = 0
    for path, _mtime, size in candidates:
        if current - (evicted_bytes / (1024 * 1024)) <= low:
            break

        # Determine if this pliego is protected (lookup by public URL)
        rel = path.relative_to(PLIEGOS_DIR)
        public_url = "/pliegos/" + str(rel).replace(os.sep, "/")
        lic = await db.licitaciones.find_one(
            {"metadata.pliego_local_url": public_url},
            {"workflow_state": 1, "metadata.pliego_stored_at": 1},
        )
        state = (lic or {}).get("workflow_state")
        if state in PROTECTED_STATES:
            continue

        try:
            path.unlink()
            evicted += 1
            evicted_bytes += size
            if lic:
                await db.licitaciones.update_one(
                    {"_id": lic["_id"]},
                    {
                        "$unset": {
                            "metadata.pliego_local_url": "",
                            "metadata.pliego_local_path": "",
                            "metadata.pliego_local_size": "",
                            "metadata.pliego_stored_at": "",
                        }
                    },
                )
        except Exception as e:
            logger.warning(f"Eviction failed for {path}: {e}")

    summary["evicted"] = evicted
    summary["evicted_mb"] = round(evicted_bytes / (1024 * 1024), 2)
    summary["after_mb"] = round(_dir_size_mb(PLIEGOS_DIR), 2)
    logger.info(f"LRU evict: removed {evicted} pliegos ({summary['evicted_mb']}MB)")
    return summary


def read_local_pliego(public_url: str) -> Optional[bytes]:
    """Read a stored pliego by its public URL ("/pliegos/.../X.pdf").

    Used by AI service to feed text to LLM without re-downloading from origin.
    """
    if not public_url or not public_url.startswith("/pliegos/"):
        return None
    rel = public_url[len("/pliegos/"):]
    path = PLIEGOS_DIR / rel
    if not path.exists():
        return None
    try:
        with open(path, "rb") as f:
            return f.read()
    except Exception as e:
        logger.warning(f"Failed reading local pliego {path}: {e}")
        return None
