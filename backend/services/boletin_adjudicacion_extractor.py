"""Extract structured adjudication data from free-text Boletín Oficial de Mendoza entries.

Designed to run over `licitaciones.description` of items coming from the Boletín.
Produces zero or more `AdjudicacionCreate`-compatible dicts per input. Confidence
scoring lets the analytics module filter low-quality extractions.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Dict, Any

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.dates import parse_date_guess


# ── Patterns ─────────────────────────────────────────────────────────

# Adjudicatario (supplier name) — ordered from most specific to most permissive
_ADJUDICATARIO_PATTERNS = [
    # "adjudícase a la firma ACME SRL"
    re.compile(
        r"adjud[ií]c[aá]s[ei]?(?:\s+el\s+(?:presente\s+)?(?:proceso|contrato))?"
        r"\s+(?:a\s+)?(?:la\s+(?:firma|empresa|Sra?\.?|Sra|razón\s+social)\s+)?"
        r"([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑñ0-9\s\.\,&\-']{3,120}?(?:S\.?A\.?|S\.?R\.?L\.?|SRL|SA|SAS|S\.?A\.?S\.?|Cooperativa|Ltda?\.?))",
        re.IGNORECASE,
    ),
    re.compile(
        r"resuelv[ea]\s+adjudicar.{0,80}?\s+a\s+"
        r"([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑñ0-9\s\.\,&\-']{3,120}?(?:S\.?A\.?|S\.?R\.?L\.?|SRL|SA|SAS))",
        re.IGNORECASE,
    ),
    re.compile(
        r"adjudicatario[:\s]+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑñ0-9\s\.\,&\-']{3,120}?(?:S\.?A\.?|S\.?R\.?L\.?|SRL|SA|SAS))",
        re.IGNORECASE,
    ),
    # Fallback: adjudica to natural person / business without legal suffix
    re.compile(
        r"adjud[ií]c[aá]s[ei]?\s+(?:a\s+)?(?:la\s+firma\s+)?"
        r"([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑñ\s\.\,&]{5,80})(?=\s+(?:por|CUIT|con|,))",
        re.IGNORECASE,
    ),
]

# Monto — pesos with various separators
_MONTO_PATTERNS = [
    # "$ 1.234.567,89" or "$1234567.89"
    re.compile(r"\$\s*([\d][\d\.\,]{2,25})(?!\d)"),
    # "pesos un millón doscientos mil ($1.234.567)" — capture numeric part
    re.compile(r"pesos?\s+.{0,150}?\(\s*\$?\s*([\d][\d\.\,]{2,25})\s*\)", re.IGNORECASE),
    # "por la suma de pesos 1.234.567,89"
    re.compile(r"por\s+la\s+suma\s+de\s+(?:pesos?\s+)?\$?\s*([\d][\d\.\,]{2,25})", re.IGNORECASE),
    # "monto adjudicado: $X"
    re.compile(r"monto\s+(?:total\s+)?adjudicado[:\s]+\$?\s*([\d][\d\.\,]{2,25})", re.IGNORECASE),
]

# CUIT
_CUIT_PATTERN = re.compile(r"C\.?U\.?I\.?T\.?[\s\-:°Nn°º]*(\d{2}[\-\.\s]?\d{8}[\-\.\s]?\d)", re.IGNORECASE)

# Expediente / proceso numbers
_EXPEDIENTE_PATTERN = re.compile(r"(?:expediente|expte?\.?|EX)\s*(?:n[°º]?\.?\s*)?([0-9\-\/EX]+)", re.IGNORECASE)
_LICITACION_NUM_PATTERN = re.compile(
    r"licitaci[oó]n\s+(?:p[uú]blica|privada|abreviada)?\s+n?°?\s*([\d\-\/]+)",
    re.IGNORECASE,
)

# Fecha de adjudicación
_FECHA_PATTERNS = [
    re.compile(r"(?:fecha\s+de\s+)?adjudicaci[oó]n[:\s]+(\d{1,2}[\-\/ ](?:de\s+)?[a-zA-Z]+[\-\/ ](?:de\s+)?\d{2,4})", re.IGNORECASE),
    re.compile(r"adjud[ií]c[aá]s[ei].{0,100}?el\s+(?:día\s+)?(\d{1,2}\s+de\s+[a-zA-Z]+\s+de\s+\d{4})", re.IGNORECASE),
    re.compile(r"Mendoza,?\s+(\d{1,2}\s+de\s+[a-zA-Z]+\s+de\s+\d{4})", re.IGNORECASE),
]

# Negative context: "desierto" / "fracasado" means NO award despite the word "adjudicación"
_NEGATIVE_PATTERNS = [
    re.compile(r"\b(?:desierto|desierta|fracasado|fracasada|declar[ao]\s+desierto)\b", re.IGNORECASE),
]


@dataclass
class ExtractedAdjudicacion:
    adjudicatario: str
    monto_adjudicado: Optional[float] = None
    fecha_adjudicacion: Optional[datetime] = None
    supplier_id: Optional[str] = None
    expedient_number: Optional[str] = None
    licitacion_number: Optional[str] = None
    confidence: float = 0.5
    raw_match: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "adjudicatario": self.adjudicatario,
            "monto_adjudicado": self.monto_adjudicado,
            "fecha_adjudicacion": self.fecha_adjudicacion,
            "supplier_id": self.supplier_id,
            "expedient_number": self.expedient_number,
            "licitacion_number": self.licitacion_number,
            "extraction_confidence": self.confidence,
            "metadata": {"raw_match": self.raw_match[:300]},
        }


# ── Parsing helpers ──────────────────────────────────────────────────

def _parse_monto(raw: str) -> Optional[float]:
    s = raw.strip()
    if not s:
        return None
    # Strip non-numeric except . , -
    s = re.sub(r"[^\d\.,\-]", "", s)
    if "," in s and "." in s:
        # Argentinian: "1.234.567,89"
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        # Could be decimal or thousand separator; assume decimal if 2 digits after
        if re.search(r",\d{1,2}$", s):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    else:
        # Only dots — could be thousand separators
        if s.count(".") > 1:
            s = s.replace(".", "")
    try:
        val = float(s)
        if val < 100:  # implausibly small, probably a page number
            return None
        return val
    except ValueError:
        return None


def _clean_adjudicatario(name: str) -> str:
    name = re.sub(r"\s+", " ", name).strip(" .,;:")
    # Remove trailing conjunctions
    name = re.sub(r"\s+(y|por|con|CUIT|cuit).*$", "", name, flags=re.IGNORECASE)
    return name.strip()


def _has_negative_context(text: str) -> bool:
    return any(p.search(text) for p in _NEGATIVE_PATTERNS)


# ── Main extractor ───────────────────────────────────────────────────

def extract_adjudicaciones(
    text: str,
    max_window: int = 1500,
) -> List[ExtractedAdjudicacion]:
    """Scan `text` and return all adjudications found.

    Each result includes an `extraction_confidence` in [0,1]:
    - 1.0 : adjudicatario + monto + fecha all matched (high trust)
    - 0.8 : adjudicatario + monto matched
    - 0.5 : only adjudicatario matched (usable but shaky)
    Results below 0.5 are dropped.
    """
    if not text or len(text) < 30:
        return []

    if _has_negative_context(text):
        return []

    results: List[ExtractedAdjudicacion] = []
    seen_names: set = set()

    for pattern in _ADJUDICATARIO_PATTERNS:
        for m in pattern.finditer(text):
            name = _clean_adjudicatario(m.group(1))
            if len(name) < 4 or name.lower() in seen_names:
                continue
            seen_names.add(name.lower())

            # Look around the match window for monto, fecha, CUIT, expediente
            start = max(0, m.start() - max_window // 3)
            end = min(len(text), m.end() + max_window)
            window = text[start:end]

            monto = None
            for mp in _MONTO_PATTERNS:
                mm = mp.search(window)
                if mm:
                    monto = _parse_monto(mm.group(1))
                    if monto:
                        break

            cuit = None
            cm = _CUIT_PATTERN.search(window)
            if cm:
                cuit = re.sub(r"[\-\.\s]", "", cm.group(1))

            expediente = None
            em = _EXPEDIENTE_PATTERN.search(window)
            if em:
                expediente = em.group(1).strip()

            lic_num = None
            lm = _LICITACION_NUM_PATTERN.search(window)
            if lm:
                lic_num = lm.group(1).strip()

            fecha = None
            for fp in _FECHA_PATTERNS:
                fm = fp.search(window)
                if fm:
                    fecha = parse_date_guess(fm.group(1))
                    if fecha:
                        break

            confidence = 0.5
            if monto and fecha:
                confidence = 1.0
            elif monto:
                confidence = 0.8
            elif fecha:
                confidence = 0.6

            results.append(ExtractedAdjudicacion(
                adjudicatario=name,
                monto_adjudicado=monto,
                fecha_adjudicacion=fecha,
                supplier_id=cuit,
                expedient_number=expediente,
                licitacion_number=lic_num,
                confidence=confidence,
                raw_match=text[max(0, m.start() - 40):m.end() + 40],
            ))

    return results
