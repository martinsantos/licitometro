from routers import admin_open_data, admin_query
from services.open_data_catalog_service import OpenDataCatalogService


def test_admin_open_data_routes_registered():
    paths = {route.path for route in admin_open_data.router.routes}
    assert "/api/admin/open-data/catalog" in paths
    assert "/api/admin/open-data/run-dataset" in paths


def test_admin_query_copilot_route_registered():
    paths = {route.path for route in admin_query.router.routes}
    assert "/api/admin/query-copilot" in paths


class _FakeCollection:
    def __init__(self):
        self.filter = None
        self.update = None
        self.upsert = None

    async def update_one(self, filter_doc, update_doc, upsert=False):
        self.filter = filter_doc
        self.update = update_doc
        self.upsert = upsert


class _FakeDb:
    def __init__(self):
        self.scraper_configs = _FakeCollection()


async def test_open_data_catalog_upserts_scraper_config_without_scheduler(monkeypatch):
    db = _FakeDb()
    svc = OpenDataCatalogService(db)

    async def fake_package_show(dataset_id):
        assert dataset_id == "jgm-sistema-contrataciones-electronicas"
        return {"title": "Sistema de Contrataciones Electronicas", "metadata_modified": "2026-01-01T00:00:00"}

    monkeypatch.setattr(svc, "_package_show", fake_package_show)

    result = await svc.upsert_dataset_config(
        dataset_id="jgm-sistema-contrataciones-electronicas",
        max_items=300,
        active=True,
        run_now=False,
    )

    assert result["ok"] is True
    assert result["triggered"] is False
    assert db.scraper_configs.upsert is True
    assert db.scraper_configs.filter == {"name": "datos_argentina_jgm_sistema_contrataciones_electronicas"}
    assert db.scraper_configs.update["$set"]["selectors"]["dataset_id"] == "jgm-sistema-contrataciones-electronicas"
    assert db.scraper_configs.update["$set"]["source_type"] == "api"
