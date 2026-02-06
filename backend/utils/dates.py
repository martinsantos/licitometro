from __future__ import annotations

from datetime import datetime, timedelta, date
from typing import Iterable, List, Optional, Set
from zoneinfo import ZoneInfo


def _safe_zoneinfo(tz_name: str) -> ZoneInfo | None:
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return None


def now_in_tz(tz_name: str) -> datetime:
    tz = _safe_zoneinfo(tz_name)
    if tz is None:
        return datetime.utcnow()
    return datetime.now(tz)


def last_business_days(count: int, tz_name: str, anchor: Optional[date] = None) -> List[date]:
    if count <= 0:
        return []
    if anchor is None:
        anchor_dt = now_in_tz(tz_name).date()
    else:
        anchor_dt = anchor

    # If anchor falls on weekend, roll back to last weekday.
    while anchor_dt.weekday() >= 5:  # 5=Saturday, 6=Sunday
        anchor_dt -= timedelta(days=1)

    days: List[date] = []
    current = anchor_dt
    while len(days) < count:
        if current.weekday() < 5:
            days.append(current)
        current -= timedelta(days=1)
    return days


def last_business_days_set(count: int, tz_name: str, anchor: Optional[date] = None) -> Set[date]:
    return set(last_business_days(count=count, tz_name=tz_name, anchor=anchor))


def parse_date_guess(value: str) -> Optional[datetime]:
    """
    Parse a date string in various formats.
    Handles common suffixes like 'Hrs.', 'Hs.', etc.
    """
    value = value.strip()
    if not value:
        return None
    
    # Strip common time suffixes used in Latin American date formats
    # e.g., "12/02/2026 07:00 Hrs." -> "12/02/2026 07:00"
    suffixes = [' Hrs.', ' Hrs', ' Hs.', ' Hs', ' hrs.', ' hrs', ' hs.', ' hs', ' horas', ' Horas']
    for suffix in suffixes:
        if value.endswith(suffix):
            value = value[:-len(suffix)].strip()
            break
    
    formats = [
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None
