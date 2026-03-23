"""Budget, date, expediente, objeto, and category extraction from plain text."""

import logging
import re
from typing import Any, Dict, Optional, Tuple

from utils.dates import parse_date_guess
from utils.time import utc_now

logger = logging.getLogger("generic_enrichment")

MAX_DESCRIPTION_LEN = 10000


def extract_budget_from_text(text: str) -> Tuple[Optional[float], str]:
    """Extract budget amount and currency from text. Returns (amount, currency)."""
    currency = "ARS"
    if re.search(r"(?:USD|U\$S|dólar)", text, re.I):
        currency = "USD"

    patterns = [
        r"(?:presupuesto|monto|importe|valor)\s*(?:oficial|estimado|total|aproximado|referencial)?[:\s]*\$?\s*([\d]+(?:\.[\d]{3})*(?:,[\d]{1,2})?)",
        r"\$\s*([\d]+(?:\.[\d]{3})+(?:,[\d]{1,2})?)",
        r"(?:presupuesto|monto|importe)\s*(?:oficial|estimado)?[:\s]*\$?\s*([\d]+\.[\d]{2})\b",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            try:
                amount_str = m.group(1).replace(".", "").replace(",", ".")
                val = float(amount_str)
                if val > 100:
                    return val, currency
            except (ValueError, IndexError):
                continue
    return None, currency


def analyze_extracted_text(text: str, lic_doc: dict) -> Dict[str, Any]:
    """Run date/budget/expediente extraction on plain text from PDF/ZIP."""
    updates: Dict[str, Any] = {}

    # Description: use extracted text if longer than current
    current_desc = lic_doc.get("description", "") or ""
    if len(text) > len(current_desc) + 20:
        updates["description"] = text[:MAX_DESCRIPTION_LEN]

    # Opening date (only if missing)
    if not lic_doc.get("opening_date"):
        normalized = re.sub(r'\s+', ' ', text)
        patterns = [
            r"fecha\s*(?:de\s+)?(?:y\s+lugar\s+de\s+)?apertura\s*(?:de\s+ofertas)?\s*[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:\s+(?:a\s+las\s+)?\d{1,2}[:.]\d{2})?)",
            r"apertura\s+(?:de\s+(?:las\s+)?(?:propuestas|ofertas|sobres)\s+)?(?:se\s+realizará\s+el\s+)?(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4}(?:\s*[,a]\s*las?\s*\d{1,2}[:.]\d{2})?)",
            r"apertura\s*[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
            r"apertura[^.]{0,30}?(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4})",
        ]
        for pat in patterns:
            m = re.search(pat, normalized, re.IGNORECASE)
            if m:
                dt = parse_date_guess(m.group(1).strip())
                if dt:
                    updates["opening_date"] = dt
                    break

    # Budget / presupuesto
    budget_val, budget_currency = extract_budget_from_text(text)
    if budget_val:
        meta = lic_doc.get("metadata", {}) or {}
        meta["budget_extracted"] = budget_val
        updates["metadata"] = meta
        if not lic_doc.get("budget"):
            updates["budget"] = budget_val
            if not lic_doc.get("currency"):
                updates["currency"] = budget_currency
            meta["budget_source"] = "extracted_from_text"

    # Expediente
    exp_match = re.search(
        r"(?:expediente|expte\.?|EX-)\s*[:\s]*([A-Z0-9][\w\-/]+)",
        text, re.IGNORECASE
    )
    if exp_match:
        meta = updates.get("metadata", lic_doc.get("metadata", {}) or {})
        meta["expediente"] = exp_match.group(1).strip()
        updates["metadata"] = meta

    _ensure_objeto_and_category(updates, lic_doc)

    # Improve title if it's just a number/code
    from utils.object_extractor import is_poor_title
    current_title = lic_doc.get("title", "")
    if is_poor_title(current_title):
        meta = updates.get("metadata", lic_doc.get("metadata", {})) or {}
        pliego = meta.get("comprar_pliego_fields", {})
        if isinstance(pliego, dict):
            better = pliego.get("Nombre descriptivo del proceso") or pliego.get("Nombre descriptivo de proceso")
            if better and len(better.strip()) > 10:
                updates["title"] = better.strip()

    if updates:
        updates["last_enrichment"] = utc_now()
        updates["updated_at"] = utc_now()
        logger.info(f"PDF/ZIP enrichment extracted {len(updates)} fields")

    return updates


def _ensure_objeto_and_category(updates: Dict[str, Any], lic_doc: dict) -> None:
    """Synthesize objeto and classify category if missing."""
    if not lic_doc.get("objeto") and not updates.get("objeto"):
        from utils.object_extractor import extract_objeto
        obj = extract_objeto(
            title=lic_doc.get("title", ""),
            description=updates.get("description", lic_doc.get("description", "")),
            metadata=updates.get("metadata", lic_doc.get("metadata", {})),
        )
        if obj:
            updates["objeto"] = obj

    if not lic_doc.get("category") and not updates.get("category"):
        from services.category_classifier import get_category_classifier
        classifier = get_category_classifier()
        title = updates.get("title", lic_doc.get("title", ""))
        objeto = updates.get("objeto", lic_doc.get("objeto", ""))
        cat = classifier.classify(title=title, objeto=objeto)
        if not cat:
            desc_short = (updates.get("description", lic_doc.get("description", "")) or "")[:500]
            cat = classifier.classify(title=title, objeto=objeto, description=desc_short)
        if cat:
            updates["category"] = cat


def enrich_title_only(lic_doc: dict) -> Dict[str, Any]:
    """Fallback enrichment: extract objeto and category from existing title/description."""
    updates: Dict[str, Any] = {}

    if not lic_doc.get("objeto"):
        from utils.object_extractor import extract_objeto
        obj = extract_objeto(
            title=lic_doc.get("title", ""),
            description=lic_doc.get("description", "") or "",
            metadata=lic_doc.get("metadata", {}),
        )
        if obj:
            updates["objeto"] = obj

    if not lic_doc.get("category"):
        from services.category_classifier import get_category_classifier
        classifier = get_category_classifier()
        title = lic_doc.get("title", "")
        objeto = updates.get("objeto", lic_doc.get("objeto", ""))
        cat = classifier.classify(title=title, objeto=objeto)
        if cat:
            updates["category"] = cat

    return updates
