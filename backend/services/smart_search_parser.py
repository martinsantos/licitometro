"""
Smart search parser: converts natural language queries into structured filters.

Examples:
  "cableado mendoza marzo 2026" -> text="cableado", jurisdiccion="Mendoza", fecha_desde=2026-03-01, fecha_hasta=2026-03-31
  "mayor a 1000000" -> budget_min=1000000
  "servicios informaticos cordoba" -> text="servicios informaticos", jurisdiccion="Córdoba"
  "aysam abierta" -> organization="AYSAM", status="active"
  "maipu informatica" -> fuente containing "Maipu", category="COMPUTACION E INFORMATICA"
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

# Known organization shortnames → regex for organization field
KNOWN_ORGS = {
    "aysam": "AYSAM",
    "osep": "OSEP",
    "epre": "EPRE",
    "emesa": "EMESA",
    "edemsa": "EDEMSA",
    "iscamen": "ISCAMEN",
    "epas": "EPAS",
    "dge": "DGE",
    "dgi": "DGI",
    "dpv": "DPV",
    "vialidad": "Vialidad",
}

# Municipality names → fuente filter (partial match)
MUNICIPIOS = {
    "maipu": "Maipu",
    "maipú": "Maipu",
    "guaymallen": "Guaymallén",
    "guaymallén": "Guaymallén",
    "godoy cruz": "Godoy Cruz",
    "las heras": "Las Heras",
    "lujan": "Luján",
    "luján": "Luján",
    "san rafael": "San Rafael",
    "san martin": "San Martín",
    "san martín": "San Martín",
    "general alvear": "General Alvear",
    "alvear": "General Alvear",
    "junin": "Junín",
    "junín": "Junín",
    "malargue": "Malargüe",
    "malargüe": "Malargüe",
    "rivadavia": "Rivadavia",
    "santa rosa": "Santa Rosa",
    "tupungato": "Tupungato",
    "lavalle": "Lavalle",
    "san carlos": "San Carlos",
    "la paz": "La Paz",
}

# Status words
STATUS_WORDS = {
    "abierta": "active",
    "abiertas": "active",
    "activa": "active",
    "activas": "active",
    "vigente": "active",
    "vigentes": "active",
    "cerrada": "closed",
    "cerradas": "closed",
    "vencida": "closed",
    "vencidas": "closed",
}

# Rubro shortcuts → category name
RUBRO_SHORTCUTS = {
    "informatica": "COMPUTACION E INFORMATICA",
    "informática": "COMPUTACION E INFORMATICA",
    "computacion": "COMPUTACION E INFORMATICA",
    "computación": "COMPUTACION E INFORMATICA",
    "limpieza": "LIMPIEZA",
    "alimentos": "ALIMENTOS",
    "comida": "ALIMENTOS",
    "combustible": "COMBUSTIBLES Y LUBRICANTES",
    "combustibles": "COMBUSTIBLES Y LUBRICANTES",
    "medicamentos": "MEDICAMENTOS Y PRODUCTOS FARMACEUTICOS",
    "farmacia": "MEDICAMENTOS Y PRODUCTOS FARMACEUTICOS",
    "construccion": "CONSTRUCCIONES",
    "construcción": "CONSTRUCCIONES",
    "obra": "CONSTRUCCIONES",
    "obras": "CONSTRUCCIONES",
    "seguridad": "SEGURIDAD",
    "vigilancia": "SEGURIDAD",
    "textil": "TEXTILES",
    "indumentaria": "TEXTILES",
    "vehiculos": "AUTOMOTORES Y REPUESTOS",
    "vehículos": "AUTOMOTORES Y REPUESTOS",
    "automotores": "AUTOMOTORES Y REPUESTOS",
    "muebles": "MUEBLES Y UTILES",
    "mobiliario": "MUEBLES Y UTILES",
    "electricidad": "ELECTRICIDAD",
    "electrico": "ELECTRICIDAD",
    "eléctrico": "ELECTRICIDAD",
    "libreria": "LIBRERIA Y PAPELERIA",
    "papeleria": "LIBRERIA Y PAPELERIA",
    "papelería": "LIBRERIA Y PAPELERIA",
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
      - status: detected status filter
      - fuente: detected municipality/source filter
      - organization: detected organization filter
      - category: detected rubro/category filter
      - auto_filters: dict of auto-detected filter labels for frontend display
    """
    result: Dict[str, Any] = {}
    auto_filters: Dict[str, str] = {}
    remaining = query.lower().strip()

    # Extract budget ranges
    # "mayor a 1000000" or "mas de 1000000" or "> 1000000"
    budget_min_match = re.search(r'(?:mayor\s+(?:a|de)|mas\s+de|>\s*)(\d[\d.,]*)', remaining)
    if budget_min_match:
        val = budget_min_match.group(1).replace('.', '').replace(',', '')
        try:
            result["budget_min"] = float(val)
            auto_filters["budget_min"] = f">${val}"
        except ValueError:
            pass
        remaining = remaining[:budget_min_match.start()] + remaining[budget_min_match.end():]

    # "menor a 500000" or "menos de 500000" or "< 500000"
    budget_max_match = re.search(r'(?:menor\s+(?:a|de)|menos\s+de|<\s*)(\d[\d.,]*)', remaining)
    if budget_max_match:
        val = budget_max_match.group(1).replace('.', '').replace(',', '')
        try:
            result["budget_max"] = float(val)
            auto_filters["budget_max"] = f"<${val}"
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
            auto_filters["fecha"] = f"{mes_name.capitalize()} {year}"
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
            auto_filters["fecha"] = f"{mes_name.capitalize()} {year}"
            remaining = remaining[:match2.start()] + remaining[match2.end():]
            break

    # Extract status words
    for word, status_val in STATUS_WORDS.items():
        pattern = rf'\b{word}\b'
        if re.search(pattern, remaining):
            result["status"] = status_val
            auto_filters["status"] = word.capitalize()
            remaining = re.sub(pattern, '', remaining, count=1)
            break

    # Extract known organization shortnames
    for org_key, org_val in KNOWN_ORGS.items():
        pattern = rf'\b{re.escape(org_key)}\b'
        if re.search(pattern, remaining):
            result["organization"] = org_val
            auto_filters["organization"] = org_val
            remaining = re.sub(pattern, '', remaining, count=1)
            break

    # Extract rubro shortcuts
    for rubro_key, rubro_val in RUBRO_SHORTCUTS.items():
        pattern = rf'\b{re.escape(rubro_key)}\b'
        if re.search(pattern, remaining):
            result["category"] = rubro_val
            auto_filters["category"] = rubro_val
            remaining = re.sub(pattern, '', remaining, count=1)
            break

    # Extract municipality names → fuente filter (try longer names first)
    sorted_munis = sorted(MUNICIPIOS.keys(), key=len, reverse=True)
    for muni_key in sorted_munis:
        if muni_key in remaining:
            result["fuente"] = MUNICIPIOS[muni_key]
            auto_filters["fuente"] = MUNICIPIOS[muni_key]
            remaining = remaining.replace(muni_key, '', 1)
            break

    # Extract jurisdictions (try longer names first) — only if no municipality matched
    if "fuente" not in result:
        sorted_juris = sorted(JURISDICCIONES.keys(), key=len, reverse=True)
        for juri_key in sorted_juris:
            if juri_key in remaining:
                result["jurisdiccion"] = JURISDICCIONES[juri_key]
                auto_filters["jurisdiccion"] = JURISDICCIONES[juri_key]
                remaining = remaining.replace(juri_key, '', 1)
                break

    # Clean up remaining text
    remaining = re.sub(r'\s+', ' ', remaining).strip()

    if remaining:
        result["text"] = remaining

    if auto_filters:
        result["auto_filters"] = auto_filters

    return result
