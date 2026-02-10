"""
Object Extractor - Synthesizes the procurement object from title, description, and metadata.

Provides:
- extract_objeto(title, description, metadata) -> Optional[str]
- is_poor_title(title) -> bool
"""

import re
from typing import Optional, Dict, Any


# Patterns that indicate a title is just a code/number, not descriptive
_POOR_TITLE_PATTERNS = [
    re.compile(r"^\d+[-/\s]", re.IGNORECASE),                  # starts with number+separator
    re.compile(r"^[A-Z]{0,5}\d{3,}", re.IGNORECASE),           # code like "LPU12345"
    re.compile(r"^(proceso de compra|boletin oficial)", re.IGNORECASE),
    re.compile(r"^(decreto|resolucion|disposicion)\s*n?\s*°?\s*\d", re.IGNORECASE),
]

# Generic boilerplate fragments that don't count as descriptive
_BOILERPLATE = {
    "gobierno de mendoza", "provincia de mendoza", "boletin oficial",
    "proceso de compra", "contratacion directa", "licitacion publica",
    "licitacion privada", "concurso de precios",
}

# Verbs/phrases that introduce the procurement object
_OBJETO_INTRO_RE = re.compile(
    r"(?:adquisici[oó]n\s+de|provisi[oó]n\s+de|construcci[oó]n\s+de|"
    r"ampliaci[oó]n\s+de|mantenimiento\s+de|prestaci[oó]n\s+de|"
    r"ejecuci[oó]n\s+de|reparaci[oó]n\s+de|instalaci[oó]n\s+de|"
    r"contrataci[oó]n\s+de(?:l?\s+servicio\s+de)?|suministro\s+de|"
    r"servicio\s+de|alquiler\s+de|locaci[oó]n\s+de|compra\s+de|"
    r"venta\s+de|obra\s*:?\s)"
    r"(.{5,200}?)(?:\.|,\s*(?:por|para|en|con|seg[uú]n)|$)",
    re.IGNORECASE,
)

# Pattern: "Objeto:" or "Objeto de la contratación:" label
_OBJETO_LABEL_RE = re.compile(
    r"objeto\s*(?:de\s+la\s+contrataci[oó]n)?\s*:\s*(.+?)(?:\.\s|$)",
    re.IGNORECASE | re.MULTILINE,
)

# UPPERCASE phrase at start (common in Boletin/decrees)
_UPPERCASE_OBJETO_RE = re.compile(
    r"(?:AMPLIACION|CONSTRUCCION|PROVISION|ADQUISICION|REPARACION|"
    r"MANTENIMIENTO|INSTALACION|CONTRATACION DE|EJECUCION DE|"
    r"OBRA|SERVICIO DE|SUMINISTRO DE)"
    r"[^.]{5,100}",
)


def is_poor_title(title: Optional[str]) -> bool:
    """Check if a title is just a code/number and not descriptive."""
    if not title:
        return True
    title = title.strip()
    if len(title) < 15:
        # Short titles are usually just codes unless they have descriptive words
        words = title.lower().split()
        descriptive = [w for w in words if len(w) > 3 and w not in _BOILERPLATE and not w.isdigit()]
        if len(descriptive) < 2:
            return True
    for pat in _POOR_TITLE_PATTERNS:
        if pat.search(title):
            return True
    return False


def _clean_objeto(text: str) -> Optional[str]:
    """Clean and truncate an extracted objeto string."""
    if not text:
        return None
    # Remove extra whitespace
    text = re.sub(r"\s+", " ", text).strip()
    # Remove leading/trailing punctuation
    text = text.strip(".,;:- ")
    # Skip if too short or boilerplate
    if len(text) < 10:
        return None
    lower = text.lower()
    for bp in _BOILERPLATE:
        if lower == bp:
            return None
    # Capitalize first letter
    text = text[0].upper() + text[1:]
    # Truncate at 200 chars on word boundary
    if len(text) > 200:
        text = text[:197]
        last_space = text.rfind(" ")
        if last_space > 150:
            text = text[:last_space]
        text += "..."
    return text


def extract_objeto(
    title: Optional[str] = None,
    description: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """
    Synthesize a short procurement object string (max 200 chars).

    Priority:
    1. metadata.comprar_pliego_fields["Objeto de la contratacion"]
    2. "Objeto:" label in description
    3. Verb-phrase extraction ("adquisicion de...", "provision de...")
    4. First significant sentence in description
    """
    meta = metadata or {}

    # 1. COMPR.AR pliego fields
    pliego = meta.get("comprar_pliego_fields", {})
    if isinstance(pliego, dict):
        for key in ("Objeto de la contratación", "Objeto de la contratacion", "Objeto"):
            val = pliego.get(key)
            if val and len(val.strip()) > 10:
                return _clean_objeto(val)

    # 2. "Objeto:" label in description
    if description:
        m = _OBJETO_LABEL_RE.search(description)
        if m:
            obj = _clean_objeto(m.group(1))
            if obj:
                return obj

    # 3. Verb-phrase extraction from description
    if description:
        m = _OBJETO_INTRO_RE.search(description)
        if m:
            # Include the verb prefix for context
            full_match = m.group(0)
            obj = _clean_objeto(full_match)
            if obj:
                return obj

    # 4. UPPERCASE phrase (common in Boletin decrees)
    if description:
        m = _UPPERCASE_OBJETO_RE.search(description)
        if m:
            obj = _clean_objeto(m.group(0))
            if obj:
                return obj

    # 5. Fallback: first significant sentence of description
    if description:
        # Split into sentences
        sentences = re.split(r"(?<=[.!?])\s+", description.strip())
        for sent in sentences[:3]:
            sent = sent.strip()
            if len(sent) > 20:
                lower = sent.lower()
                # Skip boilerplate
                if any(bp in lower for bp in _BOILERPLATE):
                    continue
                return _clean_objeto(sent)

    return None
