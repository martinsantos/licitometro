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
import re
from typing import Any


def _normalize(s: str) -> str:
    """Lowercase + strip accents for fuzzy matching."""
    s = s.lower().strip()
    for src, dst in [("á","a"),("é","e"),("í","i"),("ó","o"),("ú","u"),("ü","u"),("ñ","n")]:
        s = s.replace(src, dst)
    return s


def _tokens(value: str) -> set[str]:
    normalized = _normalize(value or "")
    return {t for t in re.split(r"[^a-z0-9]+", normalized) if len(t) >= 4}


def _overlaps_any(requirement: str, profile_signals: list[str]) -> bool:
    req_tokens = _tokens(requirement)
    if not req_tokens:
        return False
    for signal in profile_signals:
        signal_tokens = _tokens(signal)
        if req_tokens & signal_tokens:
            return True
        for req_token in req_tokens:
            for signal_token in signal_tokens:
                if min(len(req_token), len(signal_token)) >= 6 and (
                    req_token.startswith(signal_token[:6]) or signal_token.startswith(req_token[:6])
                ):
                    return True
    return False


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
    ai_v2_details: dict[str, Any] | None = None

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

    # ── AI 0.2 structured requirements ───────────────────────────────
    if requisitos.get("source") == "ai_extraction_v2":
        ai_v2_details = {
            "technical_matches": [],
            "document_matches": [],
            "missing_documents": [],
            "document_inventory_available": False,
        }
        profile_signals = [
            company_profile.get("nombre") or "",
            *(company_profile.get("rubros_inscriptos") or []),
            *(company_profile.get("certificaciones") or []),
        ]
        technical_matches = [
            req for req in (requisitos.get("capacidad_tecnica") or [])
            if _overlaps_any(str(req), profile_signals)
        ]
        ai_v2_details["technical_matches"] = technical_matches
        if technical_matches:
            points = min(12, 4 * len(technical_matches))
            score += points
            razones.append({
                "peso": points,
                "texto": f"AI 0.2 detectó {len(technical_matches)} requisito(s) técnico(s) alineado(s) al perfil",
            })

        document_inventory = company_profile.get("documentos_disponibles") or []
        ai_v2_details["document_inventory_available"] = bool(document_inventory)
        doc_signals = [
            *(company_profile.get("certificaciones") or []),
            *document_inventory,
            company_profile.get("numero_proveedor_estado") or "",
            "cuit" if company_profile.get("cuit") else "",
        ]
        required_docs = [str(doc) for doc in (requisitos.get("documentacion_requerida") or [])]
        doc_matches = [doc for doc in required_docs if _overlaps_any(doc, doc_signals)]
        ai_v2_details["document_matches"] = doc_matches
        if doc_matches:
            points = min(6, 2 * len(doc_matches))
            score += points
            razones.append({
                "peso": points,
                "texto": f"AI 0.2 encontró {len(doc_matches)} documento(s) compatibles con el perfil",
            })
        if document_inventory:
            missing_docs = [doc for doc in required_docs if doc not in doc_matches]
            ai_v2_details["missing_documents"] = missing_docs
            if missing_docs:
                penalty = min(9, 3 * len(missing_docs))
                score -= penalty
                razones.append({
                    "peso": -penalty,
                    "texto": f"AI 0.2 detectó {len(missing_docs)} documento(s) requerido(s) no presentes en el inventario",
                })

    # ── Red flags ────────────────────────────────────────────────────
    for flag in (requisitos.get("red_flags") or []):
        score -= 8
        razones.append({"peso": -8, "texto": f"⚠️ {flag}"})

    score = max(0, min(100, score))
    nivel = "alto" if score >= 70 else "medio" if score >= 45 else "bajo"
    result = {"score": score, "nivel": nivel, "razones": razones}
    if ai_v2_details is not None:
        result["ai_v2"] = ai_v2_details
    return result
