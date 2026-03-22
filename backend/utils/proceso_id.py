"""
Normalize procurement process identifiers for cross-source matching.

Generates a canonical `proceso_id` from expedient numbers, licitacion numbers,
or other identifying fields, enabling deduplication across sources like
COMPR.AR, Boletín Oficial, and ComprasApps.
"""

import re
from typing import Optional


# Patterns for extracting expedient numbers
_EXPEDIENTE_PATTERNS = [
    # EX-2026-12345678-APN-... or EX-2026-12345-MDZ
    re.compile(r"EX[-\s]*(\d{4})[-\s]*(\d+)[-\s]*([A-Z]+)", re.IGNORECASE),
    # Expte. N° 12345/2026 or Expediente 12345/26
    re.compile(r"(?:Expte\.?|Expediente)\s*N?[°º]?\s*(\d+)[/-](\d{2,4})", re.IGNORECASE),
    # Standalone: 12345-D-2026 (parliamentary style)
    re.compile(r"(\d+)-([A-Z])-(\d{4})", re.IGNORECASE),
]

# Patterns for licitacion numbers
_LICITACION_PATTERNS = [
    # N/YYYY-NNN (ComprasApps style: 3/2026-616)
    re.compile(r"^(\d+)/(\d{4})-(\d+)$"),
    # LIC-PRIV-NNN/YYYY or LP-NNN/YYYY
    re.compile(r"^(L[A-Z]*[-\s]*(?:PUB|PRIV|DIR)?[-\s]*)(\d+)[/-](\d{4})$", re.IGNORECASE),
]


def normalize_proceso_id(
    expedient_number: Optional[str] = None,
    licitacion_number: Optional[str] = None,
    title: Optional[str] = None,
    fuente: Optional[str] = None,
) -> Optional[str]:
    """
    Generate a canonical proceso_id from available identifiers.

    Priority:
    1. expedient_number → "EX-YYYY-NNNNN-ORG"
    2. licitacion_number → "LIC-N/YYYY-NNN"
    3. Extract from title (fallback)
    4. None if nothing matches

    Returns normalized uppercase string or None.
    """
    # Priority 1: Expedient number
    if expedient_number:
        pid = _normalize_expediente(expedient_number)
        if pid:
            return pid

    # Priority 2: Licitacion number
    if licitacion_number:
        pid = _normalize_licitacion_number(licitacion_number)
        if pid:
            return pid

    # Priority 3: Extract from title
    if title:
        pid = _extract_from_title(title)
        if pid:
            return pid

    return None


def _normalize_expediente(raw: str) -> Optional[str]:
    """Normalize expedient number to canonical form."""
    raw = raw.strip()

    for pattern in _EXPEDIENTE_PATTERNS:
        m = pattern.search(raw)
        if m:
            groups = m.groups()
            if len(groups) == 3 and groups[0].isdigit() and len(groups[0]) == 4:
                # EX-YYYY-NNNNN-ORG
                year, num, org = groups
                return f"EX-{year}-{num.lstrip('0') or '0'}-{org.upper()}"
            elif len(groups) == 2:
                # Expte N/YYYY
                num, year_raw = groups
                year = _normalize_year(year_raw)
                if year:
                    return f"EX-{year}-{num.lstrip('0') or '0'}"
            elif len(groups) == 3:
                # N-L-YYYY
                num, letter, year = groups
                return f"EX-{year}-{num}-{letter.upper()}"

    return None


def _normalize_licitacion_number(raw: str) -> Optional[str]:
    """Normalize licitacion number to canonical form."""
    raw = raw.strip()

    for pattern in _LICITACION_PATTERNS:
        m = pattern.match(raw)
        if m:
            groups = m.groups()
            if len(groups) == 3 and groups[1].isdigit():
                # N/YYYY-NNN style
                return f"LIC-{raw.upper()}"

    # Simple normalization: strip known prefixes, uppercase
    cleaned = re.sub(r"^(Licitaci[oó]n\s*(P[uú]blica|Privada)?\s*N?[°º]?\s*)", "", raw, flags=re.IGNORECASE).strip()
    if cleaned and len(cleaned) >= 3:
        return f"LIC-{cleaned.upper()}"

    return None


def _extract_from_title(title: str) -> Optional[str]:
    """Try to extract a proceso_id from the title."""
    # Look for expedient patterns in title
    for pattern in _EXPEDIENTE_PATTERNS:
        m = pattern.search(title)
        if m:
            return _normalize_expediente(m.group(0))

    # Look for decree/resolution numbers: "Decreto 140/2024"
    m = re.search(r"(?:Decreto|Resoluci[oó]n)\s*N?[°º]?\s*(\d+)[/-](\d{4})", title, re.IGNORECASE)
    if m:
        num, year = m.groups()
        return f"DEC-{year}-{num}"

    return None


def _normalize_year(raw: str) -> Optional[str]:
    """Normalize 2 or 4 digit year to 4 digits. Returns None for invalid years."""
    if len(raw) == 4:
        year = int(raw)
    elif len(raw) == 2:
        y = int(raw)
        if 24 <= y <= 27:
            year = 2000 + y
        else:
            return None
    else:
        return None

    if 2024 <= year <= 2027:
        return str(year)
    return None
