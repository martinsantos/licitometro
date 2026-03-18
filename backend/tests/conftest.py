"""Pytest fixtures for licitometro backend tests."""
import pytest
from datetime import datetime


@pytest.fixture
def sample_licitaciones():
    """Sample licitacion dicts for testing."""
    return [
        {
            "id_licitacion": "TEST-001",
            "title": "Adquisición de equipos informáticos para la administración",
            "objeto": "Compra de computadoras y notebooks para oficinas administrativas",
            "description": "Se requiere la adquisición de 50 computadoras de escritorio marca reconocida con Windows 11 y suite ofimática.",
            "organization": "Ministerio de Hacienda",
            "jurisdiccion": "Mendoza",
            "tipo_procedimiento": "licitacion_publica",
            "category": "Tecnología e Informática",
            "publication_date": datetime(2026, 2, 1),
            "opening_date": datetime(2026, 3, 15),
        },
        {
            "id_licitacion": "TEST-002",
            "title": "140/2025",
            "objeto": "Suministro de plantines y semillas para espacios verdes municipales",
            "description": "El municipio requiere plantines de árboles nativos y semillas de césped para mantenimiento de plazas.",
            "organization": "Municipalidad de Mendoza",
            "jurisdiccion": "Mendoza",
            "tipo_procedimiento": "contratacion_directa",
            "publication_date": datetime(2026, 1, 15),
            "opening_date": datetime(2026, 2, 20),
        },
        {
            "id_licitacion": "TEST-003",
            "title": "Licitacion de papelería y útiles de oficina",
            "objeto": None,
            "description": "Precio de Carpeta: $5000. Se solicita cotizar resmas de papel A4, carpetas y elementos de librería.",
            "organization": "Dirección General de Compras",
            "jurisdiccion": "Mendoza",
            "tipo_procedimiento": "licitacion_privada",
            "publication_date": datetime(2026, 1, 20),
            "opening_date": datetime(2026, 2, 25),
        },
    ]
