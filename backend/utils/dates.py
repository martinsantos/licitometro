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


# ============================================================================
# VIGENCIA MODEL: Enhanced Date Extraction & Validation
# ============================================================================

def extract_year_from_text(
    text: str,
    context: str = "",
    source_hint: Optional[str] = None
) -> Optional[int]:
    """
    Extract year (4-digit or 2-digit) with source-specific priority.

    Source-specific patterns (examples):
    - ComprasApps: "/2026-" (número/año-CUC)
    - Boletin: "Decreto 140/2024"
    - Santa Rosa: "/2024$" (EOL)
    - MPF: "-2024" (guión-año)

    Args:
        text: Text to search for year
        context: Additional context (e.g., "title", "description")
        source_hint: Optional source name for source-specific patterns

    Returns:
        Year between 2024-2027, or None if not found/invalid
    """
    if not text or not isinstance(text, str):
        return None

    text = text.strip()
    if not text:
        return None

    # Source-specific pattern dictionaries
    SOURCE_PATTERNS = {
        "comprasapps": [
            r"/(\d{4})-",  # /2026-616
            r"/(\d{2})-",  # /26-616
        ],
        "boletin": [
            r"/(\d{4})$",  # Decreto 140/2024
            r"/(\d{2})$",  # Decreto 140/24
        ],
        "santa_rosa": [
            r"/(\d{4})$",  # 13/2024 (EOL)
            r"/(\d{2})$",  # 13/24 (EOL)
        ],
        "mpf": [
            r"-(\d{4})",   # Resolución 100-2024
            r"/(\d{4})",   # Resolución 100/2024
        ],
    }

    # Try source-specific patterns first (if source_hint provided)
    if source_hint:
        source_key = source_hint.lower().replace(" ", "_").replace("_mendoza", "").replace("_scraper", "")
        patterns = SOURCE_PATTERNS.get(source_key, [])

        for pattern in patterns:
            match = _re.search(pattern, text)
            if match:
                year_str = match.group(1)
                year = _normalize_year(year_str)
                if year and 2024 <= year <= 2027:
                    _date_logger.debug(f"extract_year: found {year} via source pattern '{pattern}' in '{text[:50]}'")
                    return year

    # Fallback to generic 4-digit patterns
    four_digit_patterns = [
        r'\b(202[4-7])\b',  # 2024-2027 as word boundary
        r'/(\d{4})',         # /2024
        r'-(\d{4})',         # -2024
        r'\((\d{4})\)',      # (2024)
    ]

    for pattern in four_digit_patterns:
        match = _re.search(pattern, text)
        if match:
            year = int(match.group(1))
            if 2024 <= year <= 2027:
                _date_logger.debug(f"extract_year: found {year} via 4-digit pattern in '{text[:50]}'")
                return year

    # Fallback to generic 2-digit patterns
    two_digit_patterns = [
        r'/(\d{2})(?:-|$|\s)',  # /24- or /24 EOL
        r'-(\d{2})(?:-|$|\s)',  # -24- or -24 EOL
    ]

    for pattern in two_digit_patterns:
        match = _re.search(pattern, text)
        if match:
            year_str = match.group(1)
            year = _normalize_year(year_str)
            if year and 2024 <= year <= 2027:
                _date_logger.debug(f"extract_year: found {year} via 2-digit pattern in '{text[:50]}'")
                return year

    _date_logger.debug(f"extract_year: no valid year found in '{text[:100]}' (context: {context})")
    return None


def _normalize_year(year_str: str) -> Optional[int]:
    """
    Normalize 2-digit or 4-digit year string to 4-digit int.

    Rules:
    - 24-27 → 2024-2027
    - 28-99 → REJECT (impossible future)
    - 00-23 → REJECT (too old or ambiguous)
    - 2024-2027 → keep
    - Other 4-digit → REJECT

    Returns:
        Normalized year or None if invalid
    """
    if not year_str:
        return None

    try:
        year_int = int(year_str)
    except ValueError:
        return None

    # 4-digit year
    if year_int >= 1000:
        if 2024 <= year_int <= 2027:
            return year_int
        else:
            return None  # Out of range

    # 2-digit year
    if 24 <= year_int <= 27:
        return 2000 + year_int  # 24 → 2024
    else:
        return None  # REJECT 28+, 00-23


def extract_date_from_text(text: str, context: str = "") -> Optional[datetime]:
    """
    Extract full date (DD/MM/YYYY or similar) from text.

    Patterns:
    - "Publicado el 15/03/2024"
    - "Fecha: 22-01-2025"
    - "Apertura: 10 de febrero de 2026"
    - "Vence el 05/12/2024"

    Args:
        text: Text to search for date
        context: Additional context (e.g., "description", "title")

    Returns:
        Parsed datetime or None
    """
    if not text or not isinstance(text, str):
        return None

    text = text.strip()
    if not text:
        return None

    # Common date label prefixes (Spanish)
    date_labels = [
        r"(?:publicad[oa]|fecha|apertura|vence|cierre|hasta)[\s:]*",
        r"(?:el|al|hasta el)[\s:]*",
    ]

    # Build pattern: (optional label) + date
    date_patterns = [
        r"(\d{1,2}[/-]\d{1,2}[/-]\d{4})",  # DD/MM/YYYY or DD-MM-YYYY
        r"(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})",  # DD de MONTH de YYYY
        r"(\d{4}-\d{2}-\d{2})",  # YYYY-MM-DD (ISO)
    ]

    for date_pattern in date_patterns:
        # Try with labels
        for label in date_labels:
            pattern = label + date_pattern
            match = _re.search(pattern, text, flags=_re.IGNORECASE)
            if match:
                date_str = match.group(1)
                parsed = parse_date_guess(date_str)
                if parsed:
                    _date_logger.debug(f"extract_date: found {parsed.date()} via labeled pattern in '{text[:100]}' (context: {context})")
                    return parsed

        # Try without labels (standalone date)
        match = _re.search(date_pattern, text)
        if match:
            date_str = match.group(1)
            parsed = parse_date_guess(date_str)
            if parsed:
                _date_logger.debug(f"extract_date: found {parsed.date()} via standalone pattern in '{text[:100]}' (context: {context})")
                return parsed

    _date_logger.debug(f"extract_date: no date found in '{text[:100]}' (context: {context})")
    return None


def validate_date_range(dt: Optional[datetime], field_name: str) -> tuple[bool, Optional[str]]:
    """
    Validate date is within acceptable range [2024-2027].

    Args:
        dt: Date to validate (can be None)
        field_name: Name of field for error message

    Returns:
        (is_valid, error_message)
    """
    if not dt:
        return True, None  # None is allowed

    if not (2024 <= dt.year <= 2027):
        return False, f"{field_name} year {dt.year} out of range [2024-2027]"

    return True, None


def validate_date_order(
    publication_date: Optional[datetime],
    opening_date: Optional[datetime]
) -> tuple[bool, Optional[str]]:
    """
    Validate opening_date >= publication_date.

    Args:
        publication_date: Date when licitacion was published
        opening_date: Date when licitacion opens

    Returns:
        (is_valid, error_message)
    """
    if not publication_date or not opening_date:
        return True, None  # If either missing, can't validate

    if opening_date < publication_date:
        return False, f"opening_date {opening_date.date()} < publication_date {publication_date.date()}"

    return True, None


def extract_expiration_date(description: str, opening_date: Optional[datetime] = None) -> Optional[datetime]:
    """
    Extract expiration/deadline date from description.

    Patterns:
    - "Vence: DD/MM/YYYY"
    - "Plazo hasta: DD/MM/YYYY"
    - "Fecha límite: DD/MM/YYYY"
    - "Deadline: DD/MM/YYYY"
    - If not found and opening_date exists, estimate as opening_date + 30 days

    Args:
        description: Description text to search for expiration date
        opening_date: Optional opening date to use as fallback estimate

    Returns:
        Parsed datetime or None
    """
    if not description or not isinstance(description, str):
        return None

    description = description.strip()
    if not description:
        return None

    # Expiration date label patterns
    patterns = [
        r"vence:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        r"plazo\s+hasta:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        r"fecha\s+l[íi]mite:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        r"deadline:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        r"vencimiento:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        r"hasta\s+el:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
    ]

    for pattern in patterns:
        match = _re.search(pattern, description, flags=_re.IGNORECASE)
        if match:
            date_str = match.group(1)
            try:
                parsed = parse_date_guess(date_str)
                if parsed:
                    _date_logger.debug(f"extract_expiration_date: found {parsed.date()} via pattern '{pattern}'")
                    return parsed
            except:
                pass

    # Fallback: opening_date + 30 days (typical oferta validity period)
    if opening_date:
        estimated = opening_date + timedelta(days=30)
        _date_logger.debug(f"extract_expiration_date: estimated {estimated.date()} from opening_date + 30 days")
        return estimated

    return None
