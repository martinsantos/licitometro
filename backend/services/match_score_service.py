"""MatchScoreService — Rule-based affinity scoring between a company profile and licitacion requirements.

Pure function, no LLM. Takes a company_profile dict (from company_profiles collection)
and a requisitos dict (from licitacion.requisitos) and returns a 0-100 score with reasons.

Score base: 50
Adjustments:
  +10 per certification match, -15 per required cert missing
  +15 / -10 for seniority (cumple / no cumple minimum)
  +10 / -5 for zone (dentro / fuera del área operativa)
  +5 / -10 for budget (within / exceeds company capacity)
  -8 per red_flag in requisitos
Final score clamped to [0, 100]. Nivel: alto ≥ 70, medio ≥ 45, bajo < 45.
"""
from typing import Any


def _normalize(s: str) -> str:
    """Lowercase + strip accents for fuzzy matching."""
    s = s.lower().strip()
    for src, dst in [("á","a"),("é","e"),("í","i"),("ó","o"),("ú","u"),("ü","u"),("ñ","n")]:
        s = s.replace(src, dst)
    return s


def match_score(company_profile: dict, requisitos: dict) -> dict:
    """Compute affinity score between a company and a licitacion's requirements.

    Args:
        company_profile: Document from company_profiles collection.
        requisitos: Dict from licitacion.requisitos (populated by RequisitosExtractor).

    Returns:
        {"score": int, "nivel": str, "razones": [{"peso": int, "texto": str}]}
    """
    score = 50
    razones: list[dict[str, Any]] = []

    # ── Certificaciones ──────────────────────────────────────────────
    certs_req = {_normalize(c) for c in (requisitos.get("certificaciones_exigidas") or [])}
    certs_emp = {_normalize(c) for c in (company_profile.get("certificaciones") or [])}
    for c in sorted(certs_req & certs_emp):
        score += 10
        razones.append({"peso": +10, "texto": f"Tenés '{c}' que exige el pliego"})
    for c in sorted(certs_req - certs_emp):
        score -= 15
        razones.append({"peso": -15, "texto": f"Falta certificación '{c}' requerida"})

    # ── Antigüedad ───────────────────────────────────────────────────
    exp_req = requisitos.get("experiencia_minima_anios")
    exp_emp = company_profile.get("antiguedad_anios")
    if exp_req and exp_emp:
        if exp_emp >= exp_req:
            score += 15
            razones.append({"peso": +15, "texto": f"Antigüedad {exp_emp}a cumple mínimo {exp_req}a"})
        else:
            score -= 10
            razones.append({"peso": -10, "texto": f"Pliego pide {exp_req}a de experiencia, empresa tiene {exp_emp}a"})

    # ── Zona de ejecución ────────────────────────────────────────────
    zona = _normalize(requisitos.get("zona_ejecucion") or "")
    zonas_emp = [_normalize(z) for z in (company_profile.get("zonas_operacion") or [])]
    if zona and zonas_emp:
        if any(zona in z or z in zona for z in zonas_emp):
            score += 10
            razones.append({"peso": +10, "texto": f"Zona '{requisitos.get('zona_ejecucion')}' en área operativa"})
        else:
            score -= 5
            razones.append({"peso": -5, "texto": f"Zona '{requisitos.get('zona_ejecucion')}' fuera del área habitual"})

    # ── Presupuesto ──────────────────────────────────────────────────
    presup_min = company_profile.get("presupuesto_min")
    presup_max = company_profile.get("presupuesto_max")
    budget = requisitos.get("presupuesto_oficial_estimado")  # may be absent
    if budget and presup_max and budget > presup_max:
        score -= 10
        razones.append({"peso": -10, "texto": f"Presupuesto estimado supera capacidad máxima de la empresa"})
    elif budget and presup_min and budget >= presup_min:
        score += 5
        razones.append({"peso": +5, "texto": "Presupuesto dentro del rango de la empresa"})

    # ── Red flags ────────────────────────────────────────────────────
    for flag in (requisitos.get("red_flags") or []):
        score -= 8
        razones.append({"peso": -8, "texto": f"⚠️ {flag}"})

    score = max(0, min(100, score))
    nivel = "alto" if score >= 70 else "medio" if score >= 45 else "bajo"
    return {"score": score, "nivel": nivel, "razones": razones}
