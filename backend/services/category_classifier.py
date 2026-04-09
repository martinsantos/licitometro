"""
Category Classifier Service

Classifies licitaciones into COMPR.AR rubros (categories) based on
title, description, and keywords using the UNSPSC-based category system.
"""

import json
import re
from pathlib import Path
from typing import Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)

# Load rubros configuration
RUBROS_FILE = Path(__file__).parent.parent / "config" / "rubros_comprar.json"


class CategoryClassifier:
    """Classifies licitaciones into COMPR.AR rubros."""

    def __init__(self):
        self.rubros = self._load_rubros()
        self._build_keyword_index()

    def _load_rubros(self) -> List[Dict[str, Any]]:
        """Load rubros configuration from JSON file."""
        try:
            with open(RUBROS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("rubros", [])
        except Exception as e:
            logger.error(f"Error loading rubros config: {e}")
            return []

    def _build_keyword_index(self):
        """Build an index of keywords to rubros for fast lookup."""
        self.keyword_to_rubros: Dict[str, List[str]] = {}

        for rubro in self.rubros:
            rubro_nombre = rubro["nombre"]
            for keyword in rubro.get("keywords", []):
                kw_lower = keyword.lower()
                if kw_lower not in self.keyword_to_rubros:
                    self.keyword_to_rubros[kw_lower] = []
                self.keyword_to_rubros[kw_lower].append(rubro_nombre)

    # Regex to strip government organization phrases that pollute description-based
    # classification (e.g. "MINISTERIO DE GOBIERNO, INFRAESTRUCTURA Y DESARROLLO TERRITORIAL"
    # would wrongly contribute "infraestructura" to CONSTRUCCION).
    _ORG_PREFIX_RE = re.compile(
        r"(?:ministerio|secretar[ií]a|direcci[oó]n|subsecretar[ií]a|municipalidad|"
        r"gobierno|departamento|repartici[oó]n)\s+(?:general\s+)?(?:de\s+)?"
        r"[a-záéíóúñ][\wáéíóúñ\s,.-]{5,120}?"
        r"(?=[\.;\n]|\s+y\s+(?:considerando|por\s+ello)|\s+visto|$)",
        re.IGNORECASE,
    )

    # Keywords whose matches in description-only context are too ambiguous.
    # "obra" is a conjugated verb in legal Spanish ("que obra a fs. X"), "infraestructura"
    # is often part of ministry names. Require these to appear in title/objeto to count.
    _DESC_ONLY_AMBIGUOUS = {"obra", "infraestructura", "gobierno", "territorial", "desarrollo"}

    def _field_hits(self, text: str, keyword: str) -> int:
        """Count word-boundary matches of keyword in text."""
        if not text:
            return 0
        pattern = r"\b" + re.escape(keyword) + r"\b"
        return len(re.findall(pattern, text, re.IGNORECASE))

    def classify(
        self,
        title: Optional[str] = None,
        description: Optional[str] = None,
        keywords: Optional[List[str]] = None,
        objeto: Optional[str] = None,
    ) -> Optional[str]:
        """
        Classify a licitación into a rubro based on its content.

        Uses weighted field scoring:
          - objeto: weight 10  (most authoritative)
          - title:  weight 5
          - keywords: weight 3
          - description: weight 1 (with org boilerplate stripped)

        Ambiguous keywords ("obra", "infraestructura", etc.) are only counted
        when they appear in title/objeto, NOT in description-only context.

        Returns the best matching rubro name, or None if no match found.
        """
        # Strip government organization boilerplate from description to avoid
        # false positives from ministry names like "MINISTERIO DE GOBIERNO,
        # INFRAESTRUCTURA Y DESARROLLO TERRITORIAL".
        desc_clean = description or ""
        if desc_clean:
            desc_clean = self._ORG_PREFIX_RE.sub(" ", desc_clean)

        fields = {
            "objeto": (objeto or "", 10),
            "title": (title or "", 5),
            "keywords": (" ".join(keywords or []), 3),
            "description": (desc_clean, 1),
        }

        if not any(text for text, _ in fields.values()):
            return None

        # Pre-compute hits per keyword per field
        title_objeto_combined = f"{title or ''} {objeto or ''}".lower()
        rubro_scores: Dict[str, float] = {}

        for keyword, rubros in self.keyword_to_rubros.items():
            kw_lower = keyword.lower()
            is_ambiguous = kw_lower in self._DESC_ONLY_AMBIGUOUS

            for field_name, (text, weight) in fields.items():
                hits = self._field_hits(text, keyword)
                if hits == 0:
                    continue
                # Ambiguous keywords only count in title/objeto (noun context)
                if is_ambiguous and field_name == "description":
                    continue
                contribution = hits * weight
                for rubro in rubros:
                    rubro_scores[rubro] = rubro_scores.get(rubro, 0) + contribution

        if not rubro_scores:
            return None

        return max(rubro_scores, key=rubro_scores.get)

    def get_all_rubros(self) -> List[Dict[str, str]]:
        """Get list of all rubros for frontend display."""
        return [
            {"id": r["id"], "nombre": r["nombre"]}
            for r in self.rubros
        ]

    def get_rubro_keywords(self, rubro_nombre: str) -> List[str]:
        """Get keywords for a specific rubro."""
        for rubro in self.rubros:
            if rubro["nombre"] == rubro_nombre:
                return rubro.get("keywords", [])
        return []


# Singleton instance
_classifier: Optional[CategoryClassifier] = None


def get_category_classifier() -> CategoryClassifier:
    """Get or create the category classifier singleton."""
    global _classifier
    if _classifier is None:
        _classifier = CategoryClassifier()
    return _classifier


def classify_licitacion(licitacion_data: Dict[str, Any]) -> Optional[str]:
    """
    Convenience function to classify a licitación dict.

    Args:
        licitacion_data: Dict with title, description, and/or keywords

    Returns:
        Category name or None
    """
    classifier = get_category_classifier()
    return classifier.classify(
        title=licitacion_data.get("title"),
        description=licitacion_data.get("description"),
        keywords=licitacion_data.get("keywords"),
        objeto=licitacion_data.get("objeto"),
    )
