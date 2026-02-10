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

    def classify(
        self,
        title: Optional[str] = None,
        description: Optional[str] = None,
        keywords: Optional[List[str]] = None,
        objeto: Optional[str] = None,
    ) -> Optional[str]:
        """
        Classify a licitación into a rubro based on its content.

        Returns the best matching rubro name, or None if no match found.
        """
        # Combine all text for analysis
        text_parts = []
        if title:
            text_parts.append(title)
        if objeto:
            text_parts.append(objeto)
        if description:
            text_parts.append(description)
        if keywords:
            text_parts.extend(keywords)

        if not text_parts:
            return None

        combined_text = " ".join(text_parts).lower()

        # Count matches for each rubro
        rubro_scores: Dict[str, int] = {}

        for keyword, rubros in self.keyword_to_rubros.items():
            # Use word boundary search for more accurate matching
            pattern = r"\b" + re.escape(keyword) + r"\b"
            matches = len(re.findall(pattern, combined_text, re.IGNORECASE))

            if matches > 0:
                for rubro in rubros:
                    rubro_scores[rubro] = rubro_scores.get(rubro, 0) + matches

        if not rubro_scores:
            return None

        # Return the rubro with highest score
        best_rubro = max(rubro_scores, key=rubro_scores.get)
        return best_rubro

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
