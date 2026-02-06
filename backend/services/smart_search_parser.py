"""
Smart search parser: converts natural language queries into structured filters.

Examples:
  "cableado mendoza marzo 2026" -> text="cableado", jurisdiccion="Mendoza", fecha_desde=2026-03-01, fecha_hasta=2026-03-31
  "mayor a 1000000" -> budget_min=1000000
  "servicios informaticos cordoba" -> text="servicios informaticos", jurisdiccion="Córdoba"
"""

import re
from datetime import datetime, date
from typing import Dict, Any, Optional
import calendar


# Known jurisdictions
JURISDICCIONES = {
    "mendoza": "Mendoza",
    "cordoba": "Córdoba",
    "buenos aires": "Buenos Aires",
    "caba": "CABA",
    "capital federal": "CABA",
    "santa fe": "Santa Fe",
    "tucuman": "Tucumán",
    "salta": "Salta",
    "entre rios": "Entre Ríos",
    "misiones": "Misiones",
    "chaco": "Chaco",
    "corrientes": "Corrientes",
    "san juan": "San Juan",
    "san luis": "San Luis",
    "la rioja": "La Rioja",
    "catamarca": "Catamarca",
    "jujuy": "Jujuy",
    "rio negro": "Río Negro",
    "neuquen": "Neuquén",
    "chubut": "Chubut",
    "santa cruz": "Santa Cruz",
    "la pampa": "La Pampa",
    "formosa": "Formosa",
    "santiago del estero": "Santiago del Estero",
    "tierra del fuego": "Tierra del Fuego",
}

# Spanish months
MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
    "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


def parse_smart_query(query: str) -> Dict[str, Any]:
    """
    Parse a natural language search query into structured filters.

    Returns dict with possible keys:
      - text: remaining free text for full-text search
      - jurisdiccion: detected jurisdiction
      - fecha_desde: start date (YYYY-MM-DD)
      - fecha_hasta: end date (YYYY-MM-DD)
      - budget_min: minimum budget
      - budget_max: maximum budget
    """
    result: Dict[str, Any] = {}
    remaining = query.lower().strip()

    # Extract budget ranges
    # "mayor a 1000000" or "mas de 1000000" or "> 1000000"
    budget_min_match = re.search(r'(?:mayor\s+(?:a|de)|mas\s+de|>\s*)(\d[\d.,]*)', remaining)
    if budget_min_match:
        val = budget_min_match.group(1).replace('.', '').replace(',', '')
        try:
            result["budget_min"] = float(val)
        except ValueError:
            pass
        remaining = remaining[:budget_min_match.start()] + remaining[budget_min_match.end():]

    # "menor a 500000" or "menos de 500000" or "< 500000"
    budget_max_match = re.search(r'(?:menor\s+(?:a|de)|menos\s+de|<\s*)(\d[\d.,]*)', remaining)
    if budget_max_match:
        val = budget_max_match.group(1).replace('.', '').replace(',', '')
        try:
            result["budget_max"] = float(val)
        except ValueError:
            pass
        remaining = remaining[:budget_max_match.start()] + remaining[budget_max_match.end():]

    # Extract month + year patterns: "marzo 2026", "2026 marzo"
    for mes_name, mes_num in MESES.items():
        # Pattern: "mes año"
        pattern = rf'\b{mes_name}\s+(\d{{4}})\b'
        match = re.search(pattern, remaining)
        if match:
            year = int(match.group(1))
            last_day = calendar.monthrange(year, mes_num)[1]
            result["fecha_desde"] = f"{year}-{mes_num:02d}-01"
            result["fecha_hasta"] = f"{year}-{mes_num:02d}-{last_day:02d}"
            remaining = remaining[:match.start()] + remaining[match.end():]
            break

        # Pattern: "año mes"
        pattern2 = rf'\b(\d{{4}})\s+{mes_name}\b'
        match2 = re.search(pattern2, remaining)
        if match2:
            year = int(match2.group(1))
            last_day = calendar.monthrange(year, mes_num)[1]
            result["fecha_desde"] = f"{year}-{mes_num:02d}-01"
            result["fecha_hasta"] = f"{year}-{mes_num:02d}-{last_day:02d}"
            remaining = remaining[:match2.start()] + remaining[match2.end():]
            break

    # Extract jurisdictions (try longer names first)
    sorted_juris = sorted(JURISDICCIONES.keys(), key=len, reverse=True)
    for juri_key in sorted_juris:
        if juri_key in remaining:
            result["jurisdiccion"] = JURISDICCIONES[juri_key]
            remaining = remaining.replace(juri_key, '', 1)
            break

    # Clean up remaining text
    remaining = re.sub(r'\s+', ' ', remaining).strip()

    if remaining:
        result["text"] = remaining

    return result
