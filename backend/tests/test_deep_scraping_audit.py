from scripts.deep_scraping_audit import _field_coverage


class _Item:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


def test_field_coverage_counts_direct_pdf_as_direct_url():
    coverage = _field_coverage([
        _Item(
            id_licitacion="boe-1",
            title="Licitacion",
            organization="Gobierno",
            jurisdiccion="Mendoza",
            tipo_procedimiento="Boletin",
            source_url="https://boe.mendoza.gov.ar/default/public/publico/verpdf/32595",
            canonical_url="https://boe.mendoza.gov.ar/default/public/publico/verpdf/32595",
            url_quality="direct_pdf",
            attached_files=[{"url": "https://boe.mendoza.gov.ar/default/public/publico/verpdf/32595"}],
        )
    ])

    assert coverage["direct_url"] == 1.0
