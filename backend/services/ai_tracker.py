"""AI Usage Tracker — registers every LLM call for monitoring.

Tracks: provider, model, tokens consumed, endpoint, timestamp.
Used by the /ai-usage endpoint and the header counter.
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger("ai_tracker")


async def track_ai_call(db, provider: str, model: str, tokens_used: int, endpoint: str):
    """Register an AI API call in the ai_usage collection."""
    if db is None:
        return
    try:
        await db.ai_usage.insert_one({
            "provider": provider,
            "model": model,
            "tokens": tokens_used,
            "endpoint": endpoint,
            "created_at": datetime.now(timezone.utc),
        })
    except Exception as e:
        logger.debug(f"Failed to track AI call: {e}")


async def get_usage_today(db) -> dict:
    """Get AI usage stats for today."""
    if db is None:
        return {"today_calls": 0, "today_tokens": 0, "providers": {}}

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    pipeline = [
        {"$match": {"created_at": {"$gte": today_start}}},
        {"$group": {
            "_id": "$provider",
            "calls": {"$sum": 1},
            "tokens": {"$sum": "$tokens"},
        }},
    ]

    try:
        results = await db.ai_usage.aggregate(pipeline).to_list(10)
    except Exception:
        # Collection might not exist yet
        results = []

    total_calls = sum(r["calls"] for r in results)
    total_tokens = sum(r["tokens"] for r in results)
    providers = {r["_id"]: {"calls": r["calls"], "tokens": r["tokens"]} for r in results}

    # Also count legacy ai_cache entries (for backward compat)
    try:
        cache_count = await db.ai_cache.count_documents({"created_at": {"$gte": today_start}})
        total_calls += cache_count
    except Exception:
        pass

    return {
        "today_calls": total_calls,
        "today_tokens": total_tokens,
        "providers": providers,
    }
