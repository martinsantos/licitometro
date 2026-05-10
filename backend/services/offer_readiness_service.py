"""Offer readiness snapshots for Licitometro 0.2.

Snapshots persist the current bid-preparation state derived from company
profile, company document inventory, AI 0.2 requirements, and affinity score.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Dict, List

from utils.time import utc_now


READINESS_SCHEMA_VERSION = "licitometro.offer_readiness.v1"
BASE_LICITACION_URL = "https://licitometro.ar/licitaciones"


def _count(values: Any) -> int:
    return len(values) if isinstance(values, list) else 0


def _parse_budget(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _days_until(value: Any) -> int | None:
    if not value:
        return None
    parsed: datetime | None = None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    elif isinstance(value, str):
        raw = value.strip()
        for candidate in (
            raw,
            raw.replace("Z", "+00:00"),
        ):
            try:
                parsed = datetime.fromisoformat(candidate)
                break
            except ValueError:
                continue
    if not parsed:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    delta = parsed.date() - utc_now().date()
    return delta.days


def calculate_priority_score(*, licitacion: Dict[str, Any], snapshot: Dict[str, Any]) -> int:
    """Rank readiness snapshots by practical business urgency/value."""

    score = int(snapshot.get("score") or 0)
    budget = _parse_budget(licitacion.get("budget"))
    counts = snapshot.get("counts") or {}
    status = snapshot.get("status")
    priority = score
    if budget >= 100_000_000:
        priority += 25
    elif budget >= 20_000_000:
        priority += 18
    elif budget >= 5_000_000:
        priority += 10
    if status == "ready":
        priority += 15
    elif status == "blocked":
        priority += 8
    days_until_opening = _days_until(licitacion.get("opening_date") or licitacion.get("expiration_date"))
    if days_until_opening is not None:
        if 0 <= days_until_opening <= 3:
            priority += 18
        elif 4 <= days_until_opening <= 10:
            priority += 10
        elif days_until_opening < 0:
            priority -= 20
    priority -= min(20, int(counts.get("missing_documents") or 0) * 4)
    priority -= min(12, int(counts.get("red_flags") or 0) * 3)
    return max(0, min(100, priority))


def build_offer_readiness_snapshot(
    *,
    licitacion: Dict[str, Any],
    company_profile: Dict[str, Any],
    score_result: Dict[str, Any],
) -> Dict[str, Any]:
    requisitos = licitacion.get("requisitos") or {}
    ai_v2 = score_result.get("ai_v2") or {}
    missing_documents: List[str] = ai_v2.get("missing_documents") or []
    document_matches: List[str] = ai_v2.get("document_matches") or []
    technical_matches: List[str] = ai_v2.get("technical_matches") or []
    red_flags = requisitos.get("red_flags") or []
    required_documents = requisitos.get("documentacion_requerida") or []
    technical_requirements = requisitos.get("capacidad_tecnica") or []

    total_required = _count(required_documents)
    known_documents = _count(document_matches) + _count(missing_documents)
    if total_required == 0:
        document_coverage = None
    elif known_documents == 0:
        document_coverage = 0.0
    else:
        document_coverage = round(_count(document_matches) / total_required, 4)

    readiness_score = int(score_result.get("score") or 0)
    if missing_documents:
        readiness_status = "blocked"
    elif red_flags:
        readiness_status = "risk"
    elif readiness_score >= 70:
        readiness_status = "ready"
    elif readiness_score >= 45:
        readiness_status = "review"
    else:
        readiness_status = "weak"

    snapshot = {
        "schema_version": READINESS_SCHEMA_VERSION,
        "licitacion_id": str(licitacion.get("_id") or licitacion.get("id") or ""),
        "company_id": company_profile.get("company_id"),
        "score": readiness_score,
        "nivel": score_result.get("nivel"),
        "status": readiness_status,
        "requirements_source": requisitos.get("source") or "legacy",
        "requirements_schema_version": requisitos.get("schema_version"),
        "ai_v2": {
            "document_inventory_available": bool(ai_v2.get("document_inventory_available")),
            "required_documents_count": total_required,
            "document_matches": document_matches,
            "missing_documents": missing_documents,
            "document_coverage": document_coverage,
            "technical_requirements_count": _count(technical_requirements),
            "technical_matches": technical_matches,
            "red_flags": red_flags,
        },
        "counts": {
            "red_flags": _count(red_flags),
            "document_matches": _count(document_matches),
            "missing_documents": _count(missing_documents),
            "technical_matches": _count(technical_matches),
        },
        "updated_at": utc_now(),
    }
    snapshot["priority_score"] = calculate_priority_score(
        licitacion=licitacion,
        snapshot=snapshot,
    )
    return snapshot


async def upsert_offer_readiness_snapshot(db, snapshot: Dict[str, Any]) -> Dict[str, Any]:
    existing = await db.offer_readiness_snapshots.find_one(
        {
            "licitacion_id": snapshot["licitacion_id"],
            "company_id": snapshot["company_id"],
            "schema_version": snapshot["schema_version"],
        },
        {
            "status": 1,
            "score": 1,
            "priority_score": 1,
            "counts": 1,
        },
    )
    await db.offer_readiness_snapshots.update_one(
        {
            "licitacion_id": snapshot["licitacion_id"],
            "company_id": snapshot["company_id"],
            "schema_version": snapshot["schema_version"],
        },
        {"$set": snapshot, "$setOnInsert": {"created_at": snapshot["updated_at"]}},
        upsert=True,
    )
    await record_readiness_history(db, snapshot=snapshot, previous=existing)
    return snapshot


async def record_readiness_history(
    db,
    *,
    snapshot: Dict[str, Any],
    previous: Dict[str, Any] | None,
) -> None:
    """Append a compact audit event when readiness state materially changes."""

    previous = previous or {}
    changed = (
        previous.get("status") != snapshot.get("status")
        or previous.get("score") != snapshot.get("score")
        or previous.get("priority_score") != snapshot.get("priority_score")
        or (previous.get("counts") or {}) != (snapshot.get("counts") or {})
    )
    if not changed:
        return
    await db.offer_readiness_history.insert_one({
        "schema_version": snapshot["schema_version"],
        "licitacion_id": snapshot["licitacion_id"],
        "company_id": snapshot["company_id"],
        "previous": {
            "status": previous.get("status"),
            "score": previous.get("score"),
            "priority_score": previous.get("priority_score"),
            "counts": previous.get("counts"),
        },
        "current": {
            "status": snapshot.get("status"),
            "score": snapshot.get("score"),
            "priority_score": snapshot.get("priority_score"),
            "counts": snapshot.get("counts"),
        },
        "created_at": snapshot.get("updated_at") or utc_now(),
    })


def build_readiness_notification_message(
    *,
    snapshot: Dict[str, Any],
    licitacion: Dict[str, Any],
    previous_status: str | None = None,
) -> str:
    """Build a compact Telegram HTML message for readiness transitions."""

    status = snapshot.get("status")
    label = "LISTA" if status == "ready" else "BLOQUEADA" if status == "blocked" else str(status or "").upper()
    title = licitacion.get("title") or licitacion.get("objeto") or "Licitacion sin titulo"
    organization = licitacion.get("organization") or "Sin organismo"
    counts = snapshot.get("counts") or {}
    ai_v2 = snapshot.get("ai_v2") or {}
    missing_documents = ai_v2.get("missing_documents") or []
    red_flags = ai_v2.get("red_flags") or []
    url = f"{BASE_LICITACION_URL}/{snapshot.get('licitacion_id')}"

    lines = [
        f"<b>Readiness 0.2: {label}</b>",
        f"<b>{title[:120]}</b>",
        organization,
        f"Score: {snapshot.get('score', 0)}% ({snapshot.get('nivel') or 's/n'})",
    ]
    if previous_status and previous_status != status:
        lines.append(f"Transicion: {previous_status} -> {status}")
    lines.append(
        "Brechas: "
        f"{counts.get('missing_documents', 0)} doc(s) faltante(s) · "
        f"{counts.get('red_flags', 0)} riesgo(s) · "
        f"{counts.get('technical_matches', 0)} req. tecnico(s) alineado(s)"
    )
    if missing_documents:
        lines.append("Faltantes:")
        lines.extend(f"- {doc[:120]}" for doc in missing_documents[:5])
    if red_flags:
        lines.append("Riesgos:")
        lines.extend(f"- {flag[:120]}" for flag in red_flags[:3])
    lines.append(url)
    return "\n".join(lines)
