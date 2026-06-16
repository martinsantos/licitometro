from datetime import date, datetime
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from models.scraper_config import ScraperConfig
from scrapers.boletin_oficial_nacional_scraper import (
    BASE_URL,
    BoletinOficialNacionalScraper,
    bora_tercera_section_url_for_date,
    parse_bora_tercera_detail_html,
    parse_bora_tercera_list_html,
    split_bora_org_title,
)


LIST_HTML = """
<html><body>
  <h5 class="seccion-rubro">LICITACIONES</h5>
  <a href="/detalleAviso/tercera/12345/20260610">
    <p class="item">MINISTERIO DE SALUD</p>
    <p class="item-detalle">Licitación Pública 12/2026</p>
    <p class="item-detalle">Adquisición de equipamiento médico</p>
  </a>
  <a href="/detalleAviso/tercera/12345/20260610?anexos=1">
    <p class="item">MINISTERIO DE SALUD</p>
    <p class="item-detalle">Licitación Pública 12/2026</p>
    <p class="item-detalle">Adquisición de equipamiento médico</p>
  </a>
  <h5 class="seccion-rubro">CONTRATACIONES DIRECTAS</h5>
  <a href="/detalleAviso/tercera/12346/20260610">
    ADMINISTRACIÓN GENERAL Contratación Directa 7/2026 Servicio de limpieza
  </a>
  <a href="/seccion/tercera">Volver</a>
</body></html>
"""


def _list_html_for(date_str: str, aviso_ids: list[str]) -> str:
    links = "\n".join(
        f"""
        <a href="/detalleAviso/tercera/{aviso_id}/{date_str}">
          <p class="item">MINISTERIO DE SALUD</p>
          <p class="item-detalle">Licitación Pública {aviso_id}/2026</p>
          <p class="item-detalle">Adquisición de equipamiento médico</p>
        </a>
        """
        for aviso_id in aviso_ids
    )
    return f"<html><body><h5>LICITACIONES</h5>{links}</body></html>"


DETAIL_HTML = """
<html><body>
  <div id="detalleAviso">
    MINISTERIO DE SALUD.
    Expediente N° EX-2026-123456-APN-DGAYF#MS
    Objeto: Adquisición de equipamiento médico para hospitales nacionales.
    Presupuesto Oficial: $ 1.234.567,89
    Fecha de apertura: 20/06/2026 11:00
    Fecha de publicación: 10/06/2026
    <a href="/pdf/aviso-12345.pdf">Pliego</a>
  </div>
</body></html>
"""


def _config() -> ScraperConfig:
    return ScraperConfig(
        name="boletin_oficial_nacional",
        url="https://www.boletinoficial.gob.ar/seccion/tercera",
        selectors={"scraper_type": "boletin_oficial_nacional"},
        max_items=10,
    )


def test_parse_bora_tercera_list_tracks_rubro_and_dedupes_attachment_links():
    notices = parse_bora_tercera_list_html(LIST_HTML)

    assert [notice.aviso_id for notice in notices] == ["12345", "12346"]
    assert notices[0].category == "LICITACIONES"
    assert notices[0].org == "MINISTERIO DE SALUD"
    assert notices[0].title == "Licitación Pública 12/2026 - Adquisición de equipamiento médico"
    assert notices[0].source_record_id == "bora-tercera:20260610:12345"
    assert notices[1].category == "CONTRATACIONES DIRECTAS"
    assert notices[1].org == "ADMINISTRACIÓN GENERAL"
    assert notices[1].title.startswith("Contratación Directa 7/2026")


def test_split_bora_org_title_falls_back_without_procurement_keyword():
    org, title = split_bora_org_title("Texto sin separador estable")

    assert org == "Gobierno Nacional"
    assert title == "Texto sin separador estable"


def test_parse_bora_tercera_detail_extracts_dates_budget_and_attachments():
    detail = parse_bora_tercera_detail_html(
        DETAIL_HTML,
        base_url="https://www.boletinoficial.gob.ar/detalleAviso/tercera/12345/20260610",
    )

    assert detail["expediente"] == "EX-2026-123456-APN-DGAYF"
    assert detail["objeto"] == "Adquisición de equipamiento médico para hospitales nacionales"
    assert detail["budget"] == 1234567.89
    assert detail["opening_date"] == datetime(2026, 6, 20, 11, 0)
    assert detail["publication_date"] == datetime(2026, 6, 10)
    assert detail["attached_files"] == [
        {
            "name": "Pliego",
            "url": "https://www.boletinoficial.gob.ar/pdf/aviso-12345.pdf",
            "type": "pdf",
        }
    ]


def test_build_licitacion_preserves_source_record_metadata():
    scraper = BoletinOficialNacionalScraper(_config())
    notice = parse_bora_tercera_list_html(LIST_HTML)[0].as_legacy_dict()
    notice["detail_html"] = DETAIL_HTML

    item = scraper._build_licitacion(notice)

    assert item is not None
    assert item.id_licitacion == "bo-nac-12345"
    assert item.jurisdiccion == "Nacional"
    assert item.tipo_procedimiento == "Licitación Pública"
    assert item.licitacion_number == "12/2026"
    assert item.metadata["source_id"] == "boletin_oficial_nacional"
    assert item.metadata["source_record_id"] == "bora-tercera:20260610:12345"
    assert item.metadata["external_id"] == "12345"


def test_bora_tercera_section_url_for_date():
    assert (
        bora_tercera_section_url_for_date(datetime(2026, 6, 10))
        == "https://www.boletinoficial.gob.ar/seccion/tercera/20260610"
    )


async def test_scrape_section_uses_configurable_business_day_lookback(monkeypatch):
    import scrapers.boletin_oficial_nacional_scraper as module

    monkeypatch.setattr(
        module,
        "last_business_days",
        lambda count, tz_name: [date(2026, 6, 10), date(2026, 6, 9)][:count],
    )

    list_day_1 = LIST_HTML
    list_day_2 = LIST_HTML.replace("12345/20260610", "22345/20260609").replace(
        "12346/20260610", "22346/20260609"
    )
    detail_day_2 = DETAIL_HTML.replace("10/06/2026", "09/06/2026")

    class FakeBoraScraper(BoletinOficialNacionalScraper):
        def __init__(self, config):
            super().__init__(config)
            self.fetched_urls = []

        async def fetch_page(self, url):
            self.fetched_urls.append(url)
            if url == f"{BASE_URL}/seccion/tercera/20260610":
                return list_day_1
            if url == f"{BASE_URL}/seccion/tercera/20260609":
                return list_day_2
            if "/detalleAviso/tercera/22345/" in url:
                return detail_day_2
            return DETAIL_HTML

    config = _config().model_copy(update={
        "selectors": {
            "scraper_type": "boletin_oficial_nacional",
            "lookback_days": 2,
            "max_pages": 1,
        },
        "max_items": 3,
    })
    scraper = FakeBoraScraper(config)

    items = await scraper._scrape_section()

    assert [item.id_licitacion for item in items] == ["bo-nac-12345", "bo-nac-12346", "bo-nac-22345"]
    assert f"{BASE_URL}/seccion/tercera/20260610" in scraper.fetched_urls
    assert f"{BASE_URL}/seccion/tercera/20260609" in scraper.fetched_urls


async def test_scrape_section_reserves_slots_for_lookback_when_current_day_is_full(monkeypatch):
    import scrapers.boletin_oficial_nacional_scraper as module

    monkeypatch.setattr(
        module,
        "last_business_days",
        lambda count, tz_name: [date(2026, 6, 10), date(2026, 6, 9)][:count],
    )

    class FakeBoraScraper(BoletinOficialNacionalScraper):
        async def fetch_page(self, url):
            if url == f"{BASE_URL}/seccion/tercera/20260610":
                return _list_html_for("20260610", ["10001", "10002", "10003", "10004"])
            if url == f"{BASE_URL}/seccion/tercera/20260609":
                return _list_html_for("20260609", ["20001", "20002"])
            return DETAIL_HTML

    config = _config().model_copy(update={
        "selectors": {
            "scraper_type": "boletin_oficial_nacional",
            "lookback_days": 2,
            "lookback_min_items_per_day": 2,
            "max_pages": 1,
        },
        "max_items": 4,
    })
    scraper = FakeBoraScraper(config)

    items = await scraper._scrape_section()

    assert [item.id_licitacion for item in items] == [
        "bo-nac-10001",
        "bo-nac-10002",
        "bo-nac-10003",
        "bo-nac-20001",
    ]
