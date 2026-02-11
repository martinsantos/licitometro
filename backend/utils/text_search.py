"""
Accent-agnostic text search utilities for MongoDB regex queries.

Converts search tokens into regex patterns that match any accent variant:
  'energia' → '[eéèêë][nñ][eéèêë]rg[iíìîï][aáàâãä]'
  'guaymallen' → 'gu[aáàâãä]ym[aáàâãä]ll[eéèêë][nñ]'
"""

import re
import unicodedata

ACCENT_MAP = {
    'a': '[aáàâãä]', 'e': '[eéèêë]', 'i': '[iíìîï]',
    'o': '[oóòôõö]', 'u': '[uúùûü]', 'n': '[nñ]', 'c': '[cç]',
}


def strip_accents(text: str) -> str:
    """Remove accents: 'Energía' → 'energia', 'Guaymallén' → 'guaymallen'"""
    nfkd = unicodedata.normalize('NFKD', text.lower())
    return ''.join(c for c in nfkd if unicodedata.category(c) != 'Mn')


def build_accent_regex(token: str) -> str:
    """Build regex pattern that matches any accent variant of the token."""
    base = strip_accents(token)
    return ''.join(ACCENT_MAP.get(c, re.escape(c)) for c in base)
