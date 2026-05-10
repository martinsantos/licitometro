"""Evidence grounding helpers for AI-generated licitacion answers.

The service is intentionally local and dependency-free. It checks whether
material numeric/date claims in AI output can be found in the pliego text or in
trusted licitacion fields, then returns a compact assessment that callers can
attach to existing AI responses.
"""

from __future__ import annotations

import math
import re
import unicodedata
from datetime import date, datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple


_NUM_RE = re.compile(
    r"(?<![\w/])(?:ARS|\$)?\s*\d[\d.,]*"
    r"(?:\s*(?:%|por ciento|dias|dia|meses|mes|anos|ano|pesos|ARS))?",
    re.IGNORECASE,
)
_DATE_RE = re.compile(
    r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b"
)
_NO_CLAIM_VALUES = {
    "",
    "no se especifica",
    "no informado",
    "no informada",
    "n/a",
    "none",
    "null",
}


def _normalize_text(value: Any) -> str:
    text = "" if value is None else str(value)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return " ".join(text.lower().split())


def _flatten(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        return "\n".join(_flatten(v) for v in value.values())
    if isinstance(value, (list, tuple, set)):
        return "\n".join(_flatten(v) for v in value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def _flatten_fields(value: Any, prefix: str = "") -> Iterable[Tuple[str, Any]]:
    if isinstance(value, dict):
        for key, item in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            yield from _flatten_fields(item, path)
    elif isinstance(value, list):
        for idx, item in enumerate(value):
            path = f"{prefix}[{idx}]" if prefix else f"[{idx}]"
            yield from _flatten_fields(item, path)
    else:
        yield prefix, value


def _parse_number(token: str) -> Optional[float]:
    text = _normalize_text(token)
    text = (
        text.replace("$", "")
        .replace("ars", "")
        .replace("pesos", "")
        .replace("por ciento", "")
        .replace("%", "")
        .replace("dias", "")
        .replace("dia", "")
        .replace("meses", "")
        .replace("mes", "")
        .replace("anos", "")
        .replace("ano", "")
        .strip()
    )
    match = re.search(r"-?\d[\d.,]*", text)
    if not match:
        return None
    raw = match.group(0)
    if "," in raw and "." in raw:
        if raw.rfind(",") > raw.rfind("."):
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", "")
    elif "," in raw:
        left, _, right = raw.partition(",")
        raw = left + right if len(right) == 3 else left + "." + right
    elif raw.count(".") > 1:
        raw = raw.replace(".", "")
    elif "." in raw:
        left, _, right = raw.partition(".")
        if len(right) == 3 and left:
            raw = left + right
    try:
        return float(raw)
    except ValueError:
        return None


def _is_material_number(token: str, value: Optional[float]) -> bool:
    if value is None:
        return False
    text = _normalize_text(token)
    has_unit = any(
        marker in text
        for marker in ("$", "ars", "%", "por ciento", "dia", "mes", "ano", "peso")
    )
    return has_unit or value >= 20 or 1900 <= value <= 2100


def _snippet(haystack: str, needle: str, window: int = 90) -> str:
    if not haystack or not needle:
        return ""
    idx = _normalize_text(haystack).find(_normalize_text(needle))
    if idx < 0:
        return ""
    start = max(0, idx - window)
    end = min(len(haystack), idx + len(needle) + window)
    return " ".join(haystack[start:end].split())


class AIGroundingService:
    """Ground AI output against pliego text and trusted licitacion fields."""

    TRUSTED_LIC_FIELDS = (
        "title",
        "objeto",
        "organization",
        "budget",
        "currency",
        "opening_date",
        "publication_date",
        "expiration_date",
        "fecha_prorroga",
        "licitacion_number",
        "expedient_number",
        "tipo_procedimiento",
        "category",
        "requisitos",
    )

    def ground_response(
        self,
        answer: Any,
        *,
        source_text: str = "",
        licitacion: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Return a compact grounding assessment for any AI response."""

        evidence_blocks = self._build_evidence_blocks(source_text, licitacion or {})
        evidence_numbers = self._collect_evidence_numbers(evidence_blocks)
        evidence_dates = self._collect_evidence_dates(evidence_blocks)

        answer_text = _flatten(answer)
        claims = self._collect_claims(answer_text)
        supported: List[Dict[str, Any]] = []
        unsupported: List[Dict[str, Any]] = []

        for claim in claims:
            hit = self._match_claim(claim, evidence_numbers, evidence_dates)
            if hit:
                supported.append({**claim, "source": hit["source"], "snippet": hit.get("snippet", "")})
            else:
                unsupported.append({
                    "token": claim["token"],
                    "kind": claim["kind"],
                    "reason": "not_found_in_pliego_or_licitacion",
                })

        verified_fields = self._verified_fields(answer, evidence_blocks, evidence_numbers, evidence_dates)
        confidence = self._confidence(len(claims), len(supported), len(unsupported), bool(evidence_blocks))
        warnings = []
        if unsupported:
            warnings.append("AI output contains claims not found in pliego text or trusted licitacion fields.")
        if not evidence_blocks:
            warnings.append("No source evidence available for grounding.")

        return {
            "confidence": confidence,
            "verified_fields": verified_fields,
            "unsupported_claims": unsupported,
            "warnings": warnings,
            "evidence_refs": [
                {"token": item["token"], "source": item["source"], "snippet": item.get("snippet", "")}
                for item in supported[:20]
            ],
            "claims_checked": len(claims),
            "claims_supported": len(supported),
        }

    def _build_evidence_blocks(
        self,
        source_text: str,
        licitacion: Dict[str, Any],
    ) -> List[Dict[str, str]]:
        blocks: List[Dict[str, str]] = []
        if source_text:
            blocks.append({"source": "pliego_text", "text": source_text})
        for field in self.TRUSTED_LIC_FIELDS:
            value = licitacion.get(field)
            text = _flatten(value)
            if text:
                blocks.append({"source": f"licitacion.{field}", "text": text})
        return blocks

    def _collect_claims(self, text: str) -> List[Dict[str, Any]]:
        claims: List[Dict[str, Any]] = []
        seen = set()
        for match in _NUM_RE.finditer(text or ""):
            token = match.group(0).strip()
            number = _parse_number(token)
            if not _is_material_number(token, number):
                continue
            key = ("number", round(number or 0, 6), _normalize_text(token))
            if key in seen:
                continue
            seen.add(key)
            claims.append({"kind": "number", "token": token, "value": number})
        for match in _DATE_RE.finditer(text or ""):
            token = match.group(0).strip()
            key = ("date", _normalize_text(token))
            if key in seen:
                continue
            seen.add(key)
            claims.append({"kind": "date", "token": token, "value": _normalize_text(token)})
        return claims

    def _collect_evidence_numbers(self, blocks: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for block in blocks:
            for match in _NUM_RE.finditer(block["text"]):
                token = match.group(0).strip()
                value = _parse_number(token)
                if value is None:
                    continue
                rows.append({
                    "token": token,
                    "value": value,
                    "source": block["source"],
                    "snippet": _snippet(block["text"], token),
                })
        return rows

    def _collect_evidence_dates(self, blocks: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for block in blocks:
            for match in _DATE_RE.finditer(block["text"]):
                token = match.group(0).strip()
                rows.append({
                    "token": token,
                    "value": _normalize_text(token),
                    "source": block["source"],
                    "snippet": _snippet(block["text"], token),
                })
        return rows

    def _match_claim(
        self,
        claim: Dict[str, Any],
        evidence_numbers: List[Dict[str, Any]],
        evidence_dates: List[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        if claim["kind"] == "date":
            normalized = _normalize_text(claim["token"])
            for item in evidence_dates:
                if item["value"] == normalized:
                    return item
            return None

        target = claim.get("value")
        if target is None:
            return None
        for item in evidence_numbers:
            value = item.get("value")
            if value is None:
                continue
            if math.isclose(float(value), float(target), rel_tol=0.005, abs_tol=0.01):
                return item
        return None

    def _verified_fields(
        self,
        answer: Any,
        evidence_blocks: List[Dict[str, str]],
        evidence_numbers: List[Dict[str, Any]],
        evidence_dates: List[Dict[str, Any]],
    ) -> List[str]:
        if not isinstance(answer, (dict, list)):
            return []
        evidence_text = _normalize_text("\n".join(b["text"] for b in evidence_blocks))
        verified: List[str] = []
        for path, value in _flatten_fields(answer):
            raw = _flatten(value).strip()
            if _normalize_text(raw) in _NO_CLAIM_VALUES:
                verified.append(path)
                continue
            claims = self._collect_claims(raw)
            if claims:
                if all(self._match_claim(c, evidence_numbers, evidence_dates) for c in claims):
                    verified.append(path)
                continue
            normalized = _normalize_text(raw)
            if len(normalized) >= 8 and normalized in evidence_text:
                verified.append(path)
        return verified[:100]

    def _confidence(
        self,
        total_claims: int,
        supported_claims: int,
        unsupported_claims: int,
        has_evidence: bool,
    ) -> float:
        if not has_evidence:
            return 0.3
        if total_claims == 0:
            return 0.8
        if unsupported_claims == 0:
            return 0.9
        ratio = supported_claims / total_claims
        if ratio >= 0.5:
            return 0.7
        return 0.45


_singleton: Optional[AIGroundingService] = None


def get_ai_grounding_service() -> AIGroundingService:
    global _singleton
    if _singleton is None:
        _singleton = AIGroundingService()
    return _singleton
