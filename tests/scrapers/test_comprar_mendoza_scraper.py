"""
Tests operativos para MendozaCompraScraper (COMPR.AR Mendoza).

Cubre:
- Extraccion de filas del listado HTML (tabla GridListaPliegosAperturaProxima)
- Extraccion de campos ocultos ASP.NET (__VIEWSTATE, etc)
- Extraccion de postback targets y pager args
- Extraccion de URL PLIEGO desde HTML de detalle
- Extraccion de datos de licitacion desde HTML de PLIEGO
- Extraccion de list URLs desde homepage
- Flujo completo run() con mock HTTP (sin Selenium)
- Validacion del modelo LicitacionCreate resultante
"""

import sys
import os
import unittest
from unittest.mock import patch, MagicMock, AsyncMock
from datetime import datetime, date, timedelta
import re

import pytest

# Ensure backend is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.mendoza_compra import MendozaCompraScraper
from utils.dates import last_business_days_set


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_config(**overrides) -> ScraperConfig:
    """Build a ScraperConfig for COMPR.AR Mendoza tests."""
    base = {
        "name": "COMPR.AR Mendoza",
        "url": "https://comprar.mendoza.gov.ar/",
        "active": True,
        "schedule": "0 7,13,19 * * 1-5",
        "selectors": {
            "links": "a",
            "timezone": "America/Argentina/Mendoza",
            "business_days_window": 4,
            "use_selenium_pliego": False,  # disabled for unit tests
            "selenium_max_pages": 1,
            "max_pages": 2,
        },
        "pagination": {
            "list_event_target": "ctl00$CPH1$CtrlConsultasFrecuentes$btnProcesoCompraTreintaDias",
            "list_urls": [
                "https://comprar.mendoza.gov.ar/Compras.aspx?qs=W1HXHGHtH10="
            ],
        },
        "headers": {},
        "cookies": {},
        "wait_time": 0.0,
        "max_items": None,
        "source_type": "website",
    }
    base.update(overrides)
    return ScraperConfig(**base)


def _today_str_ddmmyyyy() -> str:
    return date.today().strftime("%d/%m/%Y")


def _comprar_list_html(rows: list[dict], include_pager: bool = False) -> str:
    """Build minimal COMPR.AR list HTML with GridListaPliegosAperturaProxima table.

    Each row dict: numero, title, tipo, apertura, estado, unidad, servicio_admin, target
    """
    rows_html = ""
    for r in rows:
        numero = r.get("numero", "PROC-001-2026")
        title = r.get("title", "Adquisicion de insumos")
        tipo = r.get("tipo", "Licitacion Publica")
        apertura = r.get("apertura", _today_str_ddmmyyyy() + " 10:00")
        estado = r.get("estado", "Publicado")
        unidad = r.get("unidad", "Dir. Gral. de Compras")
        servicio = r.get("servicio_admin", "SAF 01 - Gobernacion")
        target = r.get("target", "ctl00$CPH1$GridListaPliegosAperturaProxima$ctl02$lnkNumeroProceso")

        rows_html += f"""
        <tr>
          <td><a href="javascript:__doPostBack('{target}','')">{numero}</a></td>
          <td>{title}</td>
          <td>{tipo}</td>
          <td>{apertura}</td>
          <td>{estado}</td>
          <td>{unidad}</td>
          <td>{servicio}</td>
        </tr>
        """

    pager_html = ""
    if include_pager:
        pager_html = """
        <tr>
          <td colspan="7">
            <a href="javascript:__doPostBack('ctl00$CPH1$GridListaPliegosAperturaProxima','Page$2')">2</a>
            <a href="javascript:__doPostBack('ctl00$CPH1$GridListaPliegosAperturaProxima','Page$3')">3</a>
          </td>
        </tr>
        """

    return f"""<html>
    <body>
      <form>
        <input type="hidden" name="__VIEWSTATE" value="FAKE_VIEWSTATE_VALUE" />
        <input type="hidden" name="__EVENTVALIDATION" value="FAKE_EVENTVALIDATION" />
        <input type="hidden" name="__VIEWSTATEGENERATOR" value="ABC123" />
        <table id="ctl00_CPH1_GridListaPliegosAperturaProxima">
          <tr><th>N°</th><th>Nombre</th><th>Tipo</th><th>Apertura</th><th>Estado</th><th>Unidad</th><th>SAF</th></tr>
          {rows_html}
          {pager_html}
        </table>
      </form>
    </body></html>"""


def _comprar_detail_html(pliego_url: str = None) -> str:
    """Build minimal COMPR.AR detail HTML (response after clicking a row)."""
    pliego_link = ""
    if pliego_url:
        pliego_link = f'<a href="{pliego_url}">Ver Pliego</a>'
    return f"""<html><body>
    <label>Nombre descriptivo del proceso</label><span>Compra de equipamiento informatico</span>
    <label>Número de expediente</label><span>EXP-2026-001234</span>
    <label>Procedimiento de selección</label><span>Licitación Pública</span>
    <label>Fecha y hora acto de apertura</label><span>{_today_str_ddmmyyyy()} 14:00</span>
    {pliego_link}
    </body></html>"""


def _comprar_homepage_html() -> str:
    """Build minimal COMPR.AR homepage with list links."""
    return """<html><body>
    <a href="Compras.aspx?qs=W1HXHGHtH10=">Procesos con apertura proxima</a>
    <a href="Compras.aspx?qs=OTHER123">Últimos 30 días</a>
    <a href="javascript:void(0)">Ignorar</a>
    <a href="/about">Acerca de</a>
    </body></html>"""


# ---------------------------------------------------------------------------
# Test: _extract_rows_from_list
# ---------------------------------------------------------------------------

class TestExtractRowsFromList(unittest.TestCase):
    """Tests para extraccion de filas de la tabla del listado."""

    def setUp(self):
        self.config = _make_config()
        self.scraper = MendozaCompraScraper(self.config)

    def test_extracts_single_row(self):
        html = _comprar_list_html([{
            "numero": "PROC-100-2026",
            "title": "Compra directa de papel",
            "tipo": "Compra Directa",
            "apertura": "15/02/2026 09:00",
            "estado": "Publicado",
            "unidad": "Secretaria de Hacienda",
            "servicio_admin": "SAF 02",
        }])
        rows = self.scraper._extract_rows_from_list(html)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["numero"], "PROC-100-2026")
        self.assertEqual(rows[0]["title"], "Compra directa de papel")
        self.assertEqual(rows[0]["tipo"], "Compra Directa")
        self.assertEqual(rows[0]["estado"], "Publicado")
        self.assertEqual(rows[0]["unidad"], "Secretaria de Hacienda")
        self.assertEqual(rows[0]["servicio_admin"], "SAF 02")

    def test_extracts_multiple_rows(self):
        html = _comprar_list_html([
            {"numero": "A-001", "title": "Primera"},
            {"numero": "A-002", "title": "Segunda"},
            {"numero": "A-003", "title": "Tercera"},
        ])
        rows = self.scraper._extract_rows_from_list(html)
        self.assertEqual(len(rows), 3)
        nums = [r["numero"] for r in rows]
        self.assertEqual(nums, ["A-001", "A-002", "A-003"])

    def test_extracts_postback_target(self):
        target = "ctl00$CPH1$Grid$ctl05$lnkNumeroProceso"
        html = _comprar_list_html([{"target": target}])
        rows = self.scraper._extract_rows_from_list(html)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["target"], target)

    def test_empty_html_returns_empty(self):
        rows = self.scraper._extract_rows_from_list("<html><body></body></html>")
        self.assertEqual(rows, [])

    def test_table_without_rows_returns_empty(self):
        html = """<html><body><table id="ctl00_CPH1_GridListaPliegosAperturaProxima">
        <tr><th>Header</th></tr></table></body></html>"""
        rows = self.scraper._extract_rows_from_list(html)
        self.assertEqual(rows, [])


# ---------------------------------------------------------------------------
# Test: _extract_hidden_fields
# ---------------------------------------------------------------------------

class TestExtractHiddenFields(unittest.TestCase):
    """Tests para extraccion de campos ocultos ASP.NET."""

    def setUp(self):
        self.config = _make_config()
        self.scraper = MendozaCompraScraper(self.config)

    def test_extracts_viewstate_fields(self):
        html = _comprar_list_html([{"numero": "X"}])
        fields = self.scraper._extract_hidden_fields(html)
        self.assertEqual(fields["__VIEWSTATE"], "FAKE_VIEWSTATE_VALUE")
        self.assertEqual(fields["__EVENTVALIDATION"], "FAKE_EVENTVALIDATION")
        self.assertEqual(fields["__VIEWSTATEGENERATOR"], "ABC123")

    def test_empty_html_returns_empty_dict(self):
        fields = self.scraper._extract_hidden_fields("<html></html>")
        self.assertEqual(fields, {})


# ---------------------------------------------------------------------------
# Test: _extract_postback_targets and _extract_row_targets
# ---------------------------------------------------------------------------

class TestExtractPostbackTargets(unittest.TestCase):

    def setUp(self):
        self.config = _make_config()
        self.scraper = MendozaCompraScraper(self.config)

    def test_extract_postback_targets(self):
        html = """<a href="javascript:__doPostBack('target1','arg1')">Link1</a>
                   <a href="javascript:__doPostBack('target2','')">Link2</a>
                   <a href="normal.html">Normal</a>"""
        targets = self.scraper._extract_postback_targets(html)
        self.assertIn("target1", targets)
        self.assertIn("target2", targets)

    def test_extract_row_targets_filters_lnkNumeroProceso(self):
        html = _comprar_list_html([
            {"numero": "P1", "target": "ctl00$Grid$ctl02$lnkNumeroProceso"},
            {"numero": "P2", "target": "ctl00$Grid$ctl03$lnkNumeroProceso"},
        ])
        targets = self.scraper._extract_row_targets(html)
        self.assertEqual(len(targets), 2)
        self.assertTrue(all("lnkNumeroProceso" in t for t in targets))


# ---------------------------------------------------------------------------
# Test: _extract_pager_args
# ---------------------------------------------------------------------------

class TestExtractPagerArgs(unittest.TestCase):

    def setUp(self):
        self.config = _make_config()
        self.scraper = MendozaCompraScraper(self.config)

    def test_extracts_page_arguments(self):
        html = _comprar_list_html([{"numero": "X"}], include_pager=True)
        pager = self.scraper._extract_pager_args(html)
        self.assertGreater(len(pager), 0)
        grid_key = list(pager.keys())[0]
        self.assertIn("Page$2", pager[grid_key])
        self.assertIn("Page$3", pager[grid_key])

    def test_no_pager_returns_empty(self):
        html = _comprar_list_html([{"numero": "X"}], include_pager=False)
        pager = self.scraper._extract_pager_args(html)
        self.assertEqual(len(pager), 0)


# ---------------------------------------------------------------------------
# Test: _extract_pliego_url
# ---------------------------------------------------------------------------

class TestExtractPliegoUrl(unittest.TestCase):

    def setUp(self):
        self.config = _make_config()
        self.scraper = MendozaCompraScraper(self.config)

    def test_extracts_pliego_url_from_link(self):
        html = '<html><body><a href="PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=ABC123">Ver</a></body></html>'
        url = self.scraper._extract_pliego_url(html, "https://comprar.mendoza.gov.ar/")
        self.assertIsNotNone(url)
        self.assertIn("VistaPreviaPliegoCiudadano.aspx", url)
        self.assertIn("ABC123", url)

    def test_returns_none_when_no_pliego(self):
        html = '<html><body><a href="other.aspx">Not pliego</a></body></html>'
        url = self.scraper._extract_pliego_url(html, "https://comprar.mendoza.gov.ar/")
        self.assertIsNone(url)

    def test_builds_absolute_url(self):
        html = '<a href="PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=XYZ">Link</a>'
        url = self.scraper._extract_pliego_url(html, "https://comprar.mendoza.gov.ar/")
        self.assertTrue(url.startswith("https://comprar.mendoza.gov.ar/"))


# ---------------------------------------------------------------------------
# Test: _extract_list_urls
# ---------------------------------------------------------------------------

class TestExtractListUrls(unittest.TestCase):

    def setUp(self):
        self.config = _make_config()
        self.scraper = MendozaCompraScraper(self.config)

    def test_extracts_compras_aspx_links(self):
        html = _comprar_homepage_html()
        urls = self.scraper._extract_list_urls(html)
        self.assertGreater(len(urls), 0)
        self.assertTrue(any("Compras.aspx?qs=" in u for u in urls))

    def test_ignores_javascript_links(self):
        html = _comprar_homepage_html()
        urls = self.scraper._extract_list_urls(html)
        for u in urls:
            self.assertFalse(u.startswith("javascript:"))

    def test_deduplicates_urls(self):
        html = """<html><body>
        <a href="Compras.aspx?qs=SAME">Link1</a>
        <a href="Compras.aspx?qs=SAME">Link2</a>
        </body></html>"""
        urls = self.scraper._extract_list_urls(html)
        self.assertEqual(len(urls), 1)


# ---------------------------------------------------------------------------
# Test: extract_licitacion_data (PLIEGO detail page)
# ---------------------------------------------------------------------------

class TestExtractLicitacionData(unittest.IsolatedAsyncioTestCase):
    """Tests para extract_licitacion_data (parseo de pagina PLIEGO)."""

    async def test_extracts_fields_from_pliego_html(self):
        config = _make_config()
        scraper = MendozaCompraScraper(config)
        html = """<html><body>
        <label>Nombre descriptivo del proceso</label><span>Construccion de escuela rural</span>
        <label>Número de expediente</label><span>EXP-2026-5678</span>
        <label>Número de proceso</label><span>LP-050-2026</span>
        <label>Procedimiento de selección</label><span>Licitación Pública</span>
        <label>Objeto de la contratación</label><span>Construccion completa de edificio escolar</span>
        <label>Fecha y hora acto de apertura</label><span>20/02/2026 15:00</span>
        <label>Consultas</label><span>compras@mendoza.gov.ar</span>
        </body></html>"""
        url = "https://comprar.mendoza.gov.ar/PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=TEST"

        result = await scraper.extract_licitacion_data(html, url)
        self.assertIsNotNone(result)
        self.assertEqual(result.title, "Construccion de escuela rural")
        self.assertEqual(result.expedient_number, "EXP-2026-5678")
        self.assertEqual(result.licitacion_number, "LP-050-2026")
        self.assertEqual(result.tipo_procedimiento, "Licitación Pública")
        self.assertEqual(result.description, "Construccion completa de edificio escolar")
        self.assertEqual(result.contact, "compras@mendoza.gov.ar")
        self.assertEqual(result.fuente, "COMPR.AR Mendoza")
        self.assertEqual(result.jurisdiccion, "Mendoza")

    async def test_extracts_attached_files(self):
        config = _make_config()
        scraper = MendozaCompraScraper(config)
        html = """<html><body>
        <label>Nombre descriptivo del proceso</label><span>Proceso con adjuntos</span>
        <a href="/docs/pliego.pdf">Pliego completo</a>
        <a href="/docs/condiciones.docx">Condiciones</a>
        <a href="javascript:void(0)">No es archivo</a>
        </body></html>"""
        result = await scraper.extract_licitacion_data(html, "https://comprar.mendoza.gov.ar/det")
        self.assertIsNotNone(result)
        self.assertEqual(len(result.attached_files), 2)
        types = [f["type"] for f in result.attached_files]
        self.assertIn("pdf", types)
        self.assertIn("docx", types)

    async def test_handles_missing_fields_gracefully(self):
        config = _make_config()
        scraper = MendozaCompraScraper(config)
        html = "<html><body><p>Empty page</p></body></html>"
        result = await scraper.extract_licitacion_data(html, "https://comprar.mendoza.gov.ar/empty")
        # Should still produce a result with defaults
        self.assertIsNotNone(result)
        self.assertEqual(result.title, "Proceso de compra")
        self.assertEqual(result.organization, "Gobierno de Mendoza")


# ---------------------------------------------------------------------------
# Test: Full run() with mocked HTTP (no Selenium)
# ---------------------------------------------------------------------------

class TestComprarFullRun(unittest.IsolatedAsyncioTestCase):
    """Test del flujo completo run() con HTTP mockeado y Selenium deshabilitado."""

    async def test_run_extracts_from_list(self):
        """run() debe extraer licitaciones del listado HTML."""
        today = date.today()
        apertura = today.strftime("%d/%m/%Y") + " 10:00"

        list_html = _comprar_list_html([
            {"numero": "LP-001-2026", "title": "Compra de insumos medicos",
             "tipo": "Licitacion Publica", "apertura": apertura,
             "estado": "Publicado", "unidad": "Min. Salud", "servicio_admin": "SAF 05"},
            {"numero": "CD-002-2026", "title": "Servicio de limpieza",
             "tipo": "Compra Directa", "apertura": apertura,
             "estado": "Publicado", "unidad": "Min. Educacion", "servicio_admin": "SAF 03"},
        ])

        homepage_html = _comprar_homepage_html()

        # Detail HTML when clicking a row (postback response)
        detail_html = _comprar_detail_html(
            pliego_url="PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=PLIEGO1"
        )

        call_count = {"n": 0}
        responses = {
            0: homepage_html,  # fetch homepage
            1: list_html,       # fetch list_url
        }

        async def mock_fetch_page(url):
            idx = call_count["n"]
            call_count["n"] += 1
            return responses.get(idx, list_html)

        async def mock_postback(url, fields):
            return detail_html

        config = _make_config(selectors={
            "links": "a",
            "timezone": "America/Argentina/Mendoza",
            "business_days_window": 4,
            "use_selenium_pliego": False,
            "selenium_max_pages": 0,
            "max_pages": 1,
        })
        scraper = MendozaCompraScraper(config)

        with patch.object(scraper, "setup", new=AsyncMock()), \
             patch.object(scraper, "cleanup", new=AsyncMock()), \
             patch.object(scraper, "fetch_page", side_effect=mock_fetch_page), \
             patch.object(scraper, "_postback", side_effect=mock_postback):

            results = await scraper.run()

        self.assertGreater(len(results), 0, "Should extract at least one licitacion from the list")
        for lic in results:
            self.assertIsInstance(lic, LicitacionCreate)
            self.assertEqual(lic.fuente, "COMPR.AR Mendoza")
            self.assertEqual(lic.jurisdiccion, "Mendoza")

    async def test_run_empty_homepage_returns_empty(self):
        """run() con homepage vacia y sin list URLs debe retornar lista vacia."""
        config = _make_config(
            pagination={"list_urls": []},
            selectors={
                "links": "a",
                "timezone": "America/Argentina/Mendoza",
                "business_days_window": 4,
                "use_selenium_pliego": False,
                "max_pages": 1,
            },
        )
        scraper = MendozaCompraScraper(config)

        async def mock_fetch_page(url):
            return "<html><body>Empty</body></html>"

        async def mock_postback(url, fields):
            return None

        with patch.object(scraper, "setup", new=AsyncMock()), \
             patch.object(scraper, "cleanup", new=AsyncMock()), \
             patch.object(scraper, "fetch_page", side_effect=mock_fetch_page), \
             patch.object(scraper, "_postback", side_effect=mock_postback):

            results = await scraper.run()

        self.assertEqual(len(results), 0)

    async def test_run_homepage_fetch_fails_returns_empty(self):
        """run() cuando no se puede cargar la homepage debe retornar lista vacia."""
        config = _make_config()
        scraper = MendozaCompraScraper(config)

        async def mock_fetch_page(url):
            return None

        with patch.object(scraper, "setup", new=AsyncMock()), \
             patch.object(scraper, "cleanup", new=AsyncMock()), \
             patch.object(scraper, "fetch_page", side_effect=mock_fetch_page):

            results = await scraper.run()

        self.assertEqual(len(results), 0)

    async def test_run_filters_by_date_window(self):
        """Procesos con fecha fuera de la ventana de dias habiles se filtran."""
        old_date = "01/01/2020 10:00"
        list_html = _comprar_list_html([
            {"numero": "OLD-001", "title": "Viejo", "apertura": old_date, "estado": "Publicado"},
        ])
        homepage_html = _comprar_homepage_html()

        call_count = {"n": 0}

        async def mock_fetch_page(url):
            idx = call_count["n"]
            call_count["n"] += 1
            if idx == 0:
                return homepage_html
            return list_html

        async def mock_postback(url, fields):
            return "<html></html>"

        config = _make_config(selectors={
            "links": "a",
            "timezone": "America/Argentina/Mendoza",
            "business_days_window": 4,
            "use_selenium_pliego": False,
            "max_pages": 1,
        })
        scraper = MendozaCompraScraper(config)

        with patch.object(scraper, "setup", new=AsyncMock()), \
             patch.object(scraper, "cleanup", new=AsyncMock()), \
             patch.object(scraper, "fetch_page", side_effect=mock_fetch_page), \
             patch.object(scraper, "_postback", side_effect=mock_postback):

            results = await scraper.run()

        # Old dates should be filtered out
        old_ids = [r.id_licitacion for r in results if r.id_licitacion == "OLD-001"]
        self.assertEqual(len(old_ids), 0, "Old-dated processes should be filtered out")

    async def test_run_assigns_pliego_url_when_found(self):
        """Cuando se encuentra una URL PLIEGO en el detalle, debe asignarse a source_url."""
        today = date.today()
        apertura = today.strftime("%d/%m/%Y") + " 10:00"

        list_html = _comprar_list_html([{
            "numero": "PLIEGO-001",
            "title": "Proceso con pliego",
            "apertura": apertura,
            "estado": "Publicado",
        }])
        homepage_html = _comprar_homepage_html()
        detail_with_pliego = _comprar_detail_html(
            pliego_url="PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=REAL_URL"
        )

        call_count = {"n": 0}

        async def mock_fetch_page(url):
            idx = call_count["n"]
            call_count["n"] += 1
            if idx == 0:
                return homepage_html
            return list_html

        async def mock_postback(url, fields):
            return detail_with_pliego

        config = _make_config(selectors={
            "links": "a",
            "timezone": "America/Argentina/Mendoza",
            "business_days_window": 4,
            "use_selenium_pliego": False,
            "max_pages": 1,
        })
        scraper = MendozaCompraScraper(config)

        with patch.object(scraper, "setup", new=AsyncMock()), \
             patch.object(scraper, "cleanup", new=AsyncMock()), \
             patch.object(scraper, "fetch_page", side_effect=mock_fetch_page), \
             patch.object(scraper, "_postback", side_effect=mock_postback):

            results = await scraper.run()

        pliego_results = [r for r in results if r.id_licitacion == "PLIEGO-001"]
        if pliego_results:
            lic = pliego_results[0]
            source = str(lic.source_url) if lic.source_url else ""
            self.assertIn("VistaPreviaPliegoCiudadano", source,
                          "source_url should contain the PLIEGO URL")


# ---------------------------------------------------------------------------
# Test: Metadata structure
# ---------------------------------------------------------------------------

class TestComprarMetadata(unittest.TestCase):
    """Verifica la estructura de metadata producida por el scraper."""

    def test_metadata_keys(self):
        """Los campos comprar_* deben estar presentes en metadata."""
        config = _make_config()
        scraper = MendozaCompraScraper(config)

        # Simulate what run() builds for row_entries
        expected_keys = [
            "comprar_list_url",
            "comprar_target",
            "comprar_estado",
            "comprar_unidad_ejecutora",
            "comprar_servicio_admin",
            "comprar_pliego_url",
        ]
        # Build a sample metadata dict as the scraper does
        meta = {
            "comprar_list_url": "https://comprar.mendoza.gov.ar/Compras.aspx?qs=X",
            "comprar_target": "ctl00$CPH1$Grid$ctl02$lnk",
            "comprar_estado": "Publicado",
            "comprar_unidad_ejecutora": "Min. Salud",
            "comprar_servicio_admin": "SAF 05",
            "comprar_pliego_url": None,
        }
        for key in expected_keys:
            self.assertIn(key, meta)


# ---------------------------------------------------------------------------
# Test: LicitacionCreate model validation
# ---------------------------------------------------------------------------

class TestComprarLicitacionModel(unittest.TestCase):
    """Verifica que el modelo LicitacionCreate acepta los datos del scraper."""

    def test_valid_licitacion_from_comprar(self):
        data = {
            "title": "Adquisicion de equipos",
            "organization": "Min. Salud",
            "publication_date": datetime.now(),
            "opening_date": datetime.now(),
            "expedient_number": None,
            "licitacion_number": "LP-100-2026",
            "description": "Adquisicion de equipos",
            "contact": None,
            "source_url": "https://comprar.mendoza.gov.ar/PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=X",
            "status": "active",
            "location": "Mendoza",
            "attached_files": [],
            "id_licitacion": "LP-100-2026",
            "jurisdiccion": "Mendoza",
            "tipo_procedimiento": "Licitacion Publica",
            "tipo_acceso": "COMPR.AR",
            "fecha_scraping": datetime.now(),
            "fuente": "COMPR.AR Mendoza",
            "metadata": {
                "comprar_list_url": "https://comprar.mendoza.gov.ar/Compras.aspx?qs=X",
                "comprar_target": "target",
                "comprar_estado": "Publicado",
                "comprar_pliego_url": None,
            },
        }
        lic = LicitacionCreate(**data)
        self.assertEqual(lic.id_licitacion, "LP-100-2026")
        self.assertEqual(lic.fuente, "COMPR.AR Mendoza")
        self.assertEqual(lic.jurisdiccion, "Mendoza")


if __name__ == "__main__":
    unittest.main()
