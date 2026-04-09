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

# Verbs/phrases that introduce the procurement object.
# NOTE: "obra" as verb ("la nota que obra a fojas X") is ambiguous in Spanish legalese,
# so it is NOT listed here as a generic prefix. "Obra:" as a label is handled separately
# by _OBJETO_LABEL_RE with strict line-start + colon.
#
# The capture allows an optional connector "e/y <second_verb> de" so that phrases like
# "adquisición E instalación de una máquina cafetera" are matched (previously failed because
# the regex required "adquisición DE" directly).
_OBJETO_INTRO_RE = re.compile(
    r"(?:adquisici[oó]n|provisi[oó]n|construcci[oó]n|"
    r"ampliaci[oó]n|mantenimiento|prestaci[oó]n|"
    r"ejecuci[oó]n|reparaci[oó]n|instalaci[oó]n|"
    r"contrataci[oó]n(?:\s+del?\s+servicio)?|suministro|"
    r"servicio|alquiler|locaci[oó]n|compra|venta)"
    r"(?:\s+[eyo]\s+(?:adquisici[oó]n|provisi[oó]n|construcci[oó]n|"
    r"ampliaci[oó]n|mantenimiento|prestaci[oó]n|"
    r"ejecuci[oó]n|reparaci[oó]n|instalaci[oó]n|suministro|"
    r"servicio|compra))?"
    r"\s+de\s+"
    r"(.{5,200}?)"
    r"(?=[\.\;\:]|\n|,\s*(?:por|para|en|con|seg[uú]n|destinad[oa]s?|conforme|mediante)|$)",
    re.IGNORECASE,
)

# Strict "OBJETO:" label (line-start, colon required) — unambiguous
_OBJETO_STRICT_LABEL_RE = re.compile(
    r"(?:^|\n)\s*(?:objeto|obra)\s*:\s*(.+?)(?:[\.\n;]|$)",
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


def _strip_boe_header(text: str) -> str:
    """Strip Boletin Oficial metadata header up to the 'Visto' decree opening.

    BOE web items begin with: "Imprimir Texto Publicado Tema: Decreto Origen: MINISTERIO...
    DE MES DE YYYY Visto el expediente...". Everything before "Visto" is metadata and
    contaminates both category classification and objeto fallback extraction.
    """
    if not text:
        return text
    m = re.search(r"\b[Vv]isto\s+(?:el|la|lo|los)\b", text)
    if m:
        return text[m.start():]
    return text


def _find_obra_label(text: str) -> Optional[str]:
    """Find an "obra: <CONSTRUCTION NAME>" label in text.

    Requires the content after the colon to START with an uppercase letter to filter
    the verbal usage ("orden N° 15 obra la Solicitud..."). Used for decrees that
    adjudicate a construction work.
    """
    if not text:
        return None
    for m in re.finditer(r"(?:^|[\W])obra\s*:\s*", text, re.IGNORECASE):
        rest = text[m.end():m.end() + 300]
        if not rest:
            continue
        # Content must start with uppercase letter (construction work name)
        if not rest[0].isupper():
            continue
        # Capture until period, semicolon, or newline
        end_m = re.search(r"[.;\n]", rest)
        content = rest[:end_m.start()] if end_m else rest[:200]
        if len(content.strip()) > 10:
            return content.strip()
    return None


def extract_objeto(
    title: Optional[str] = None,
    description: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """
    Synthesize a short procurement object string (max 200 chars).

    Priority:
    1. metadata.comprar_pliego_fields["Objeto de la contratacion"]
    2. "Objeto:" label in description (strict, line-anchored)
    3. Verb-phrase extraction ("adquisicion de...", "provision de...")
    4. "obra: <UPPERCASE>" construction-work label (mid-sentence, uppercase content only)
    5. UPPERCASE decree phrase
    6. First significant sentence (after stripping BOE metadata header)
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

    # 4. "obra: <UPPERCASE construction name>" — only when content is uppercase
    #    (filters verbal "obra" usage)
    if description:
        obra_content = _find_obra_label(description)
        if obra_content:
            obj = _clean_objeto("Obra: " + obra_content)
            if obj:
                return obj

    # 5. UPPERCASE phrase (common in Boletin decrees)
    if description:
        m = _UPPERCASE_OBJETO_RE.search(description)
        if m:
            obj = _clean_objeto(m.group(0))
            if obj:
                return obj

    # 6. Fallback: first significant sentence of description.
    #    Strip BOE metadata header first so we don't get "Imprimir Texto Publicado..."
    if description:
        clean_desc = _strip_boe_header(description)
        # Split into sentences
        sentences = re.split(r"(?<=[.!?;])\s+", clean_desc.strip())
        for sent in sentences[:5]:
            sent = sent.strip()
            if len(sent) < 20:
                continue
            lower = sent.lower()
            # Skip sentences that are pure boilerplate or header echoes
            if any(bp in lower for bp in _BOILERPLATE):
                continue
            # Skip decree boilerplate fragments
            if re.match(
                r"^(?:imprimir|visto|considerando|y\s+considerando|por\s+ello|el\s+gobernador|"
                r"que\s+(?:en|el|la|los|las)|tema\s*:|origen\s*:)",
                lower,
            ):
                continue
            return _clean_objeto(sent)

    return None
