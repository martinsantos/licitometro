"""Test the PJN Magistratura scraper HTML parsing."""

from scrapers.pjn_scraper import PJNScraper, ORGANIZATION, BASE_URL
from models.scraper_config import ScraperConfig


MOCK_LISTING_HTML = """<!DOCTYPE html>
<html><body>
<table>
<thead><tr><th>Numero</th><th>Nombre</th><th>Fecha de Apertura</th><th>Tipo</th><th>Estado</th></tr></thead>
<tbody>
<tr>
  <td>282/2026</td>
  <td><a href="/contrataciones/282">Servicio Y Provision De Tanques De Agua - Tucuman 348, C.a.b.a.</a></td>
  <td>6 de may. de 2026 9:00<br/>06/05/2026 09:00</td>
  <td>Tramite Simplificado</td>
  <td>Publicada</td>
</tr>
<tr>
  <td>192/2026</td>
  <td><a href="/contrataciones/192">Renovacion Parcial Instalacion Termomecanica</a></td>
  <td>8 de may. de 2026 10:00<br/>08/05/2026 10:00</td>
  <td>Licitacion Privada</td>
  <td>Publicada</td>
</tr>
<tr>
  <td>250/2026</td>
  <td><a href="/contrataciones/250">Adecuacion Y Mantenimiento De Ascensores</a></td>
  <td>26 de may. de 2026 9:00<br/>26/05/2026 09:00</td>
  <td>Licitacion Publica</td>
  <td>Publicada</td>
</tr>
</tbody>
</table>
</body></html>"""


class TestPJNScraperParsing:
    """Test PJN scraper HTML parsing without network calls."""

    def setup_method(self):
        # Bypass ABC check: PJNScraper uses run() not abstract methods
        PJNScraper.__abstractmethods__ = frozenset()
        config = ScraperConfig(
            name="magistratura_pjn",
            url="https://srpcm.pjn.gov.ar/contrataciones",
            selectors={"scraper_type": "pjn"},
        )
        self.scraper = PJNScraper.__new__(PJNScraper)
        self.scraper.config = config

    def test_parse_listing(self):
        """Parse listing HTML and extract rows."""
        rows = self.scraper._parse_listing(MOCK_LISTING_HTML)
        assert len(rows) == 3

        row0 = rows[0]
        assert row0["numero"] == "282/2026"
        assert "Tanques" in row0["nombre"]
        assert row0["detail_url"] == "https://srpcm.pjn.gov.ar/contrataciones/282"
        assert row0["tipo_procedimiento"] == "Tramite Simplificado"
        assert row0["estado"] == "Publicada"
        assert row0["opening_date"] is not None

    def test_build_item(self):
        """Convert parsed row to licitacion item dict."""
        rows = self.scraper._parse_listing(MOCK_LISTING_HTML)
        item = self.scraper._build_item(rows[0])

        assert item["organization"] == ORGANIZATION
        assert item["fuente"] == "Magistratura PJN"
        assert item["tags"] == ["LIC_AR"]
        assert "282/2026" in item["title"]
        assert "Tanques" in item["title"]
        assert item["source_url"] == "https://srpcm.pjn.gov.ar/contrataciones/282"
        assert item["opening_date"] is not None
        assert item["metadata"]["pj_n_numero"] == "282/2026"
        assert item["metadata"]["pj_n_tipo"] == "Tramite Simplificado"
        assert item["metadata"]["pj_n_estado"] == "Publicada"

    def test_build_item_no_detail_url(self):
        """Fallback to listing URL when no detail link."""
        row = {"numero": "123/2026", "nombre": "Test Item", "detail_url": None,
               "opening_date": None, "tipo_procedimiento": "Directa", "estado": "Publicada"}
        item = self.scraper._build_item(row)
        assert item["source_url"] == f"{BASE_URL}/contrataciones"

    def test_parse_date_spanish(self):
        """Parse Spanish long date format."""
        dt = self.scraper._parse_date("6 de may. de 2026 9:00")
        assert dt is not None
        assert "2026-05-06T09:00" in dt

    def test_parse_date_iso(self):
        """Parse ISO-ish short date format."""
        dt = self.scraper._parse_date("06/05/2026 09:00")
        assert dt is not None
        assert "2026-05-06T09:00" in dt

    def test_parse_date_none(self):
        """None/empty input returns None."""
        assert self.scraper._parse_date("") is None
        assert self.scraper._parse_date(None) is None

    def test_parse_listing_empty(self):
        """Empty HTML returns no rows."""
        rows = self.scraper._parse_listing("<html><body><table></table></body></html>")
        assert len(rows) == 0

    def test_parse_listing_no_table(self):
        """HTML without table returns no rows."""
        rows = self.scraper._parse_listing("<html><body><p>No data</p></body></html>")
        assert len(rows) == 0
