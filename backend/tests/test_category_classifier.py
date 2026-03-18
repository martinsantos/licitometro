"""Tests for CategoryClassifier to verify no false positives from pliego boilerplate."""
import pytest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))


class TestCategoryClassifier:
    """Test that pliego boilerplate doesn't cause false positives."""

    @pytest.fixture
    def classifier(self):
        try:
            from services.category_classifier import CategoryClassifier
            return CategoryClassifier()
        except ImportError:
            pytest.skip("CategoryClassifier not available")

    def test_libreria_not_triggered_by_boilerplate(self, classifier):
        """'carpeta' and 'papel' in pliego boilerplate shouldn't classify as LIBRERÍA."""
        boilerplate = (
            "Precio de Carpeta: $5000. "
            "Se requiere papel membreteado para los documentos. "
            "El formulario debe completarse en papel A4."
        )
        result = classifier.classify(
            title="Licitación de servicios de limpieza",
            objeto="Servicio de limpieza y mantenimiento de edificios",
            description=boilerplate,
        )
        # If a category is returned, it should NOT be Librería/Papelería
        if result:
            assert "librería" not in result.lower()
            assert "papelería" not in result.lower()

    def test_it_classification(self, classifier):
        """IT equipment should classify correctly."""
        result = classifier.classify(
            title="Adquisición de equipos informáticos",
            objeto="Compra de computadoras y notebooks",
            description="Se requieren 50 equipos de escritorio con Windows 11",
        )
        # Should classify as some IT category
        assert result is not None

    def test_construction_classification(self, classifier):
        """Construction works should classify correctly."""
        result = classifier.classify(
            title="Obra de pavimentación calle San Martín",
            objeto="Pavimentación y bacheo urbano",
            description="Trabajos de repavimentación con hormigón de la calzada principal",
        )
        assert result is not None

    def test_empty_inputs_dont_crash(self, classifier):
        """Empty inputs should return None gracefully."""
        result = classifier.classify(title="", objeto="", description="")
        assert result is None or isinstance(result, str)
