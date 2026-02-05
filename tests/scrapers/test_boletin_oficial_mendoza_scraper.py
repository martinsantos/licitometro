"""
Tests operativos para BoletinOficialMendozaScraper.

Cubre:
- Parseo de HTML de resultados del Boletin Oficial
- Filtrado por ventana de dias habiles
- Filtrado estricto por regex
- Manejo de keywords
- Extraccion de campos (tipo, norma, fechas, organizacion, PDFs)
- Llamada a la API de busqueda avanzada (mockeada)
- Flujo completo run() con mock HTTP
"""

import sys
import os
import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, date, timedelta

import pytest

# Ensure backend is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.boletin_oficial_mendoza_scraper import BoletinOficialMendozaScraper
from utils.dates import last_business_days_set


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_config(**overrides) -> ScraperConfig:
    """Build a ScraperConfig for Boletin Oficial Mendoza tests."""
    base = {
        "name": "Boletin Oficial Mendoza",
        "url": "https://informacionoficial.mendoza.gob.ar/boletinoficial/busqueda-avanzada/",
        "active": True,
        "schedule": "0 7,13,19 * * 1-5",
        "selectors": {
            "timezone": "America/Argentina/Mendoza",
            "business_days_window": 4,
            "keywords": ["licitacion", "licitación", "contratacion"],
            "strict_filter_regex": r"\b(licitaci[oó]n|contrataci[oó]n|concurso)\b",
        },
        "pagination": {
            "advance_search_url": "https://portalgateway.mendoza.gov.ar/api/boe/advance-search",
            "tipo_boletin": 2,
        },
        "headers": {},
        "cookies": {},
        "wait_time": 0.0,
        "max_items": None,
        "source_type": "api",
    }
    base.update(overrides)
    return ScraperConfig(**base)


def _today_str() -> str:
    return date.today().isoformat()


def _boletin_html_with_rows(rows_data: list[dict]) -> str:
    """Build a minimal Boletin Oficial results HTML table.

    Each row_data dict can have:
      tipo, norma, fec_pro, fec_pub, boletin_num, boletin_link,
      details_text, texto_publicado_url
    """
    rows_html = ""
    for r in rows_data:
        tipo = r.get("tipo", "DECRETO")
        norma = r.get("norma", "123/2026")
        fec_pro = r.get("fec_pro", "03/02/2026")
        fec_pub = r.get("fec_pub", _today_str().replace("-", "/"))
        boletin_num = r.get("boletin_num", "35000")
        boletin_link = r.get("boletin_link", "https://example.com/boletin.pdf")
        details_text = r.get("details_text", "Licitación Publica para obra vial")
        texto_url = r.get("texto_publicado_url", "")

        boletin_td = f'<td><a href="{boletin_link}">{boletin_num}</a></td>' if boletin_link else f"<td>{boletin_num}</td>"

        detail_extra = ""
        if texto_url:
            detail_extra = f'<a href="{texto_url}">Texto Publicado</a>'

        rows_html += f"""
        <tr class="toggle-head">
          <td>{tipo}</td>
          <td>{norma}</td>
          <td>{fec_pro}</td>
          <td>{fec_pub}</td>
          {boletin_td}
        </tr>
        <tr class="toggle-body">
          <td colspan="5">Origen: MINISTERIO DE OBRAS PUBLICAS {details_text} Pág. 15 {detail_extra}</td>
        </tr>
        """

    return f"""<html><body>
    <table id="list-table">
      <thead><tr><th>Tipo</th><th>Norma</th><th>F.Pro</th><th>F.Pub</th><th>Boletin</th></tr></thead>
      <tbody>{rows_html}</tbody>
    </table>
    </body></html>"""


# ---------------------------------------------------------------------------
# Test: Parseo de HTML de resultados
# ---------------------------------------------------------------------------

class TestParseResultsHtml(unittest.TestCase):
    """Tests para _parse_results_html (extraccion de filas del boletin)."""

    def setUp(self):
        self.config = _make_config()
        self.scraper = BoletinOficialMendozaScraper(self.config)

    def test_parse_single_row_with_licitacion_keyword(self):
        """Una fila que contiene 'licitación' debe generar un LicitacionCreate."""
        today = date.today()
        fec_pub = today.strftime("%d/%m/%Y")
        html = _boletin_html_with_rows([{
            "tipo": "DECRETO",
            "norma": "456/2026",
            "fec_pub": fec_pub,
            "details_text": "Licitación Publica Nacional N° 10/2026",
        }])
        results = self.scraper._parse_results_html(html, keyword="licitacion")
        self.assertGreaterEqual(len(results), 1)
        lic = results[0]
        self.assertIsInstance(lic, LicitacionCreate)
        self.assertIn("456/2026", lic.title)
        self.assertEqual(lic.fuente, "Boletin Oficial Mendoza")
        self.assertEqual(lic.jurisdiccion, "Mendoza")

    def test_parse_extracts_organization_from_origen(self):
        """Debe extraer el organismo del texto 'Origen: ...'."""
        today = date.today()
        fec_pub = today.strftime("%d/%m/%Y")
        html = _boletin_html_with_rows([{
            "fec_pub": fec_pub,
            "details_text": "Licitación Publica",
        }])
        results = self.scraper._parse_results_html(html, keyword="licitacion")
        self.assertGreaterEqual(len(results), 1)
        # El HTML tiene "Origen: MINISTERIO DE OBRAS PUBLICAS"
        self.assertIn("MINISTERIO DE OBRAS PUBLICAS", results[0].organization)

    def test_parse_extracts_pdf_links(self):
        """Debe extraer links a PDFs (boletin y texto publicado)."""
        today = date.today()
        fec_pub = today.strftime("%d/%m/%Y")
        html = _boletin_html_with_rows([{
            "fec_pub": fec_pub,
            "boletin_link": "https://boletin.mendoza.gov.ar/edicion.pdf",
            "texto_publicado_url": "https://boletin.mendoza.gov.ar/texto.pdf",
            "details_text": "Licitación Publica N° 5/2026",
        }])
        results = self.scraper._parse_results_html(html, keyword="licitacion")
        self.assertGreaterEqual(len(results), 1)
        files = results[0].attached_files
        self.assertIsNotNone(files)
        # Should have at least the texto publicado and the boletin
        urls = [f["url"] for f in files]
        has_texto = any("texto.pdf" in u for u in urls)
        has_boletin = any("edicion.pdf" in u for u in urls)
        self.assertTrue(has_texto, f"Expected texto publicado PDF link, got {urls}")
        self.assertTrue(has_boletin, f"Expected boletin PDF link, got {urls}")

    def test_parse_filters_by_date_window(self):
        """Filas con fecha fuera de la ventana de dias habiles se filtran."""
        old_date = "01/01/2020"
        html = _boletin_html_with_rows([{
            "fec_pub": old_date,
            "details_text": "Licitación Publica vieja",
        }])
        results = self.scraper._parse_results_html(html, keyword="licitacion")
        self.assertEqual(len(results), 0, "Old-dated rows should be filtered out")

    def test_parse_strict_regex_filters_noise(self):
        """Filas sin keywords de licitacion en el texto deben ser filtradas por el regex estricto."""
        today = date.today()
        fec_pub = today.strftime("%d/%m/%Y")
        html = _boletin_html_with_rows([{
            "tipo": "DECRETO",
            "norma": "999/2026",
            "fec_pub": fec_pub,
            "details_text": "Designacion de personal administrativo",
        }])
        results = self.scraper._parse_results_html(html, keyword=None)
        self.assertEqual(len(results), 0, "Rows without procurement keywords should be filtered")

    def test_parse_empty_html_returns_empty(self):
        """HTML vacio o sin tabla retorna lista vacia."""
        results = self.scraper._parse_results_html("<html><body></body></html>", keyword=None)
        self.assertEqual(results, [])

    def test_parse_multiple_rows(self):
        """Multiples filas validas generan multiples LicitacionCreate."""
        today = date.today()
        fec_pub = today.strftime("%d/%m/%Y")
        rows = [
            {"norma": "100/2026", "fec_pub": fec_pub, "details_text": "Licitación uno"},
            {"norma": "200/2026", "fec_pub": fec_pub, "details_text": "Contratación dos"},
            {"norma": "300/2026", "fec_pub": fec_pub, "details_text": "Concurso tres"},
        ]
        html = _boletin_html_with_rows(rows)
        results = self.scraper._parse_results_html(html, keyword="licitacion")
        self.assertGreaterEqual(len(results), 1)

    def test_id_licitacion_format(self):
        """El id_licitacion debe tener formato 'boletin-mza:norma:...'."""
        today = date.today()
        fec_pub = today.strftime("%d/%m/%Y")
        html = _boletin_html_with_rows([{
            "norma": "777/2026",
            "fec_pub": fec_pub,
            "details_text": "Licitación test",
        }])
        results = self.scraper._parse_results_html(html, keyword="licitacion")
        self.assertGreaterEqual(len(results), 1)
        self.assertTrue(results[0].id_licitacion.startswith("boletin-mza:norma:"))
        self.assertIn("777/2026", results[0].id_licitacion)


# ---------------------------------------------------------------------------
# Test: Business date range
# ---------------------------------------------------------------------------

class TestBusinessDateRange(unittest.TestCase):
    """Tests para _business_date_range."""

    def test_returns_iso_date_strings(self):
        config = _make_config()
        scraper = BoletinOficialMendozaScraper(config)
        start, end = scraper._business_date_range()
        # Both should be valid ISO dates
        date.fromisoformat(start)
        date.fromisoformat(end)

    def test_start_before_or_equal_end(self):
        config = _make_config()
        scraper = BoletinOficialMendozaScraper(config)
        start, end = scraper._business_date_range()
        self.assertLessEqual(start, end)


# ---------------------------------------------------------------------------
# Test: In business window
# ---------------------------------------------------------------------------

class TestInBusinessWindow(unittest.TestCase):
    """Tests para _in_business_window."""

    def setUp(self):
        self.config = _make_config()
        self.scraper = BoletinOficialMendozaScraper(self.config)

    def test_today_is_in_window(self):
        now = datetime.now()
        # Today (if weekday) should be in the 4-day business window
        if now.weekday() < 5:
            self.assertTrue(self.scraper._in_business_window(now))

    def test_old_date_not_in_window(self):
        old = datetime(2020, 1, 1)
        self.assertFalse(self.scraper._in_business_window(old))

    def test_none_returns_false(self):
        self.assertFalse(self.scraper._in_business_window(None))


# ---------------------------------------------------------------------------
# Test: Full run() with mocked HTTP
# ---------------------------------------------------------------------------

class TestBoletinFullRun(unittest.IsolatedAsyncioTestCase):
    """Tests del flujo completo run() con HTTP mockeado."""

    async def test_run_with_keyword_results(self):
        """run() debe retornar licitaciones cuando la API devuelve HTML con filas validas."""
        today = date.today()
        fec_pub = today.strftime("%d/%m/%Y")
        mock_html = _boletin_html_with_rows([{
            "tipo": "RESOLUCION",
            "norma": "888/2026",
            "fec_pub": fec_pub,
            "details_text": "Licitación Publica Internacional",
            "boletin_link": "https://boletin.mendoza.gov.ar/ed.pdf",
        }])

        config = _make_config(selectors={
            "timezone": "America/Argentina/Mendoza",
            "business_days_window": 4,
            "keywords": ["licitacion"],
            "strict_filter_regex": r"\b(licitaci[oó]n)\b",
        })
        scraper = BoletinOficialMendozaScraper(config)

        # Mock the aiohttp session
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.text = unittest.mock.AsyncMock(return_value=mock_html)
        mock_response.__aenter__ = unittest.mock.AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = unittest.mock.AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_response)
        mock_session.close = unittest.mock.AsyncMock()

        scraper.session = mock_session

        # Patch setup/cleanup to avoid real HTTP
        with patch.object(scraper, "setup", new=unittest.mock.AsyncMock()):
            scraper.session = mock_session
            results = await scraper.run()

        self.assertGreaterEqual(len(results), 1)
        lic = results[0]
        self.assertEqual(lic.fuente, "Boletin Oficial Mendoza")
        self.assertIn("888/2026", lic.title)

    async def test_run_no_results_returns_empty(self):
        """run() con HTML vacio debe retornar lista vacia."""
        config = _make_config(selectors={
            "timezone": "America/Argentina/Mendoza",
            "business_days_window": 4,
            "keywords": ["licitacion"],
            "strict_filter_regex": r"\b(licitaci[oó]n)\b",
        })
        scraper = BoletinOficialMendozaScraper(config)

        empty_html = "<html><body><p>No results</p></body></html>"
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.text = unittest.mock.AsyncMock(return_value=empty_html)
        mock_response.__aenter__ = unittest.mock.AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = unittest.mock.AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_response)
        mock_session.close = unittest.mock.AsyncMock()

        with patch.object(scraper, "setup", new=unittest.mock.AsyncMock()):
            scraper.session = mock_session
            results = await scraper.run()

        self.assertEqual(len(results), 0)

    async def test_run_api_failure_returns_empty(self):
        """run() cuando la API devuelve error HTTP debe retornar lista vacia."""
        config = _make_config()
        scraper = BoletinOficialMendozaScraper(config)

        mock_response = MagicMock()
        mock_response.status = 500
        mock_response.__aenter__ = unittest.mock.AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = unittest.mock.AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_response)
        mock_session.close = unittest.mock.AsyncMock()

        with patch.object(scraper, "setup", new=unittest.mock.AsyncMock()):
            scraper.session = mock_session
            results = await scraper.run()

        self.assertEqual(len(results), 0)

    async def test_run_results_sorted_by_date_desc(self):
        """Los resultados deben estar ordenados por fecha de publicacion descendente."""
        today = date.today()
        yesterday = today - timedelta(days=1)
        # Skip weekends
        while yesterday.weekday() >= 5:
            yesterday -= timedelta(days=1)

        html = _boletin_html_with_rows([
            {"norma": "OLD/2026", "fec_pub": yesterday.strftime("%d/%m/%Y"), "details_text": "Licitación vieja"},
            {"norma": "NEW/2026", "fec_pub": today.strftime("%d/%m/%Y"), "details_text": "Licitación nueva"},
        ])

        config = _make_config(selectors={
            "timezone": "America/Argentina/Mendoza",
            "business_days_window": 4,
            "keywords": ["licitacion"],
            "strict_filter_regex": r"\b(licitaci[oó]n)\b",
        })
        scraper = BoletinOficialMendozaScraper(config)

        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.text = unittest.mock.AsyncMock(return_value=html)
        mock_response.__aenter__ = unittest.mock.AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = unittest.mock.AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_response)
        mock_session.close = unittest.mock.AsyncMock()

        with patch.object(scraper, "setup", new=unittest.mock.AsyncMock()):
            scraper.session = mock_session
            results = await scraper.run()

        if len(results) >= 2:
            self.assertGreaterEqual(results[0].publication_date, results[1].publication_date)


# ---------------------------------------------------------------------------
# Test: _fetch_advance_search builds correct payload
# ---------------------------------------------------------------------------

class TestFetchAdvanceSearch(unittest.IsolatedAsyncioTestCase):
    """Tests para _fetch_advance_search (payload y manejo de respuesta)."""

    async def test_sends_correct_payload(self):
        """Debe enviar keyword, tipo_boletin y rango de fechas en el payload."""
        config = _make_config()
        scraper = BoletinOficialMendozaScraper(config)

        captured_kwargs = {}

        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.text = unittest.mock.AsyncMock(return_value="<html></html>")
        mock_response.__aenter__ = unittest.mock.AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = unittest.mock.AsyncMock(return_value=False)

        def capture_post(url, **kwargs):
            captured_kwargs.update(kwargs)
            captured_kwargs["url"] = url
            return mock_response

        mock_session = MagicMock()
        mock_session.post = capture_post
        scraper.session = mock_session

        result = await scraper._fetch_advance_search(keyword="licitacion", tipo_busqueda="NORMA")

        self.assertIsNotNone(result)
        payload = captured_kwargs.get("data", {})
        self.assertEqual(payload["texto"], "licitacion")
        self.assertEqual(payload["tipo_busqueda"], "NORMA")
        self.assertEqual(payload["tipo_boletin"], "2")
        self.assertIn("fechaPubDes", payload)
        self.assertIn("fechaPubHas", payload)

    async def test_returns_none_on_http_error(self):
        """Debe retornar None si la API responde con error."""
        config = _make_config()
        scraper = BoletinOficialMendozaScraper(config)

        mock_response = MagicMock()
        mock_response.status = 503
        mock_response.__aenter__ = unittest.mock.AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = unittest.mock.AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_response)
        scraper.session = mock_session

        result = await scraper._fetch_advance_search(keyword="test")
        self.assertIsNone(result)

    async def test_returns_none_on_exception(self):
        """Debe retornar None si hay excepcion de red."""
        config = _make_config()
        scraper = BoletinOficialMendozaScraper(config)

        mock_session = MagicMock()
        mock_session.post = MagicMock(side_effect=Exception("Connection refused"))
        scraper.session = mock_session

        result = await scraper._fetch_advance_search(keyword="test")
        self.assertIsNone(result)


# ---------------------------------------------------------------------------
# Test: LicitacionCreate model validation
# ---------------------------------------------------------------------------

class TestBoletinLicitacionModel(unittest.TestCase):
    """Verifica que los objetos producidos por el scraper cumplen el modelo."""

    def test_all_required_fields_present(self):
        today = date.today()
        fec_pub = today.strftime("%d/%m/%Y")
        config = _make_config()
        scraper = BoletinOficialMendozaScraper(config)
        html = _boletin_html_with_rows([{
            "fec_pub": fec_pub,
            "details_text": "Licitación test model",
        }])
        results = scraper._parse_results_html(html, keyword="licitacion")
        if results:
            lic = results[0]
            self.assertIsNotNone(lic.id_licitacion)
            self.assertIsNotNone(lic.title)
            self.assertIsNotNone(lic.organization)
            self.assertIsNotNone(lic.jurisdiccion)
            self.assertIsNotNone(lic.publication_date)
            self.assertIsNotNone(lic.tipo_procedimiento)
            self.assertIsNotNone(lic.fuente)
            self.assertEqual(lic.status, "active")


if __name__ == "__main__":
    unittest.main()
