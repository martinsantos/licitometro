from datetime import datetime, timezone


def utc_now() -> datetime:
    """Timezone-aware UTC timestamp. Use instead of datetime.utcnow()."""
    return datetime.now(timezone.utc)
