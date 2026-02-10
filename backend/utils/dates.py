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


import logging
import re as _re

_date_logger = logging.getLogger("utils.dates")


def parse_date_guess(value: str) -> Optional[datetime]:
    """
    Parse a date string in various formats.
    Handles common suffixes like 'Hrs.', 'Hs.', etc.
    """
    if not value or not isinstance(value, str):
        return None
    original = value
    value = value.strip()
    if not value:
        return None

    # Strip common time suffixes used in Latin American date formats
    # e.g., "12/02/2026 07:00 Hrs." -> "12/02/2026 07:00"
    suffixes = [' Hrs.', ' Hrs', ' Hs.', ' Hs', ' hrs.', ' hrs', ' hs.', ' hs', ' horas', ' Horas', ' hs.']
    for suffix in suffixes:
        if value.endswith(suffix):
            value = value[:-len(suffix)].strip()
            break

    # Normalize separators: "12-02-2026" -> keep, "12 de febrero de 2026" -> handled below
    # Remove "de " in Spanish dates: "12 de febrero de 2026" or "12 de 02 de 2026"
    value = _re.sub(r'\s+de\s+', ' ', value, flags=_re.IGNORECASE)

    # Try replacing Spanish month names with numbers
    _MONTHS_ES = {
        'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
        'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
        'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12',
        'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'ago': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12',
    }
    value_lower = value.lower()
    for month_name, month_num in _MONTHS_ES.items():
        if month_name in value_lower:
            value = _re.sub(month_name, month_num, value, flags=_re.IGNORECASE)
            break

    # Remove stray commas (e.g., "22 12, 2025" -> "22 12 2025")
    value = value.replace(',', ' ')

    # Collapse multiple spaces
    value = _re.sub(r'\s+', ' ', value).strip()

    formats = [
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%d %m %Y",
        "%d %m %Y %H:%M",
        "%d/%m/%y",
        "%d/%m/%y %H:%M",
        "%d-%m-%y",
        "%m/%d/%Y",
        "%m/%d/%Y %H:%M",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue

    _date_logger.warning(f"parse_date_guess: could not parse '{original}' (cleaned: '{value}')")
    return None
