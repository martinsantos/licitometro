"""Shared zone-context matching for licitacion organization + tipo_procedimiento."""

from typing import Optional


from config.company import DEFAULT_COMPANY_ID


async def find_best_zone(db, organization: str, tipo: str = ""):
    """Return best matching company_context doc for an organization + tipo_procedimiento.

    3-phase lookup: exact match → containment match → "General" fallback.
    """
    if not organization:
        return None

    # 1. Exact match
    query = {"company_id": DEFAULT_COMPANY_ID, "zona": organization}
    if tipo:
        query["tipo_proceso"] = tipo
    doc = await db.company_contexts.find_one(query)
    if doc:
        return doc

    # 2. Contains match (either direction)
    all_contexts = await db.company_contexts.find(
        {"company_id": DEFAULT_COMPANY_ID}
    ).to_list(200)

    org_lower = organization.lower()
    best = None
    best_score = 0
    for ctx in all_contexts:
        zona_lower = (ctx.get("zona") or "").lower()
        if not zona_lower:
            continue
        if zona_lower in org_lower or org_lower in zona_lower:
            score = len(zona_lower)  # Longer = more specific
            if tipo and ctx.get("tipo_proceso", "").lower() in tipo.lower():
                score += 100
            if score > best_score:
                best = ctx
                best_score = score

    # 3. Fallback to "General"
    if not best:
        fallback_query = {"company_id": DEFAULT_COMPANY_ID, "zona": "General"}
        if tipo:
            fallback_query["tipo_proceso"] = tipo
        best = await db.company_contexts.find_one(fallback_query)
        if not best:
            best = await db.company_contexts.find_one(
                {"company_id": DEFAULT_COMPANY_ID, "zona": "General"}
            )

    return best
