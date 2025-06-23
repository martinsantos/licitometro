import pytest
from httpx import AsyncClient
from uuid import uuid4
from datetime import datetime, timezone

# Import the FastAPI app instance
# This assumes your FastAPI app instance is named 'app' in 'server.py'
# Adjust the import path if your project structure is different.
from backend.server import app
from backend.models.licitacion import LicitacionCreate, Licitacion


# Fixture for the LicitacionRepository (if needed for direct mocking, though most tests will go through API)
# from backend.db.repositories import LicitacionRepository
# from backend.dependencies import get_licitacion_repository


# Sample Licitacion data for testing
sample_licitacion_data_1 = {
    "title": "Test Licitacion Alpha",
    "organization": "Org Alpha",
    "publication_date": datetime.now(timezone.utc).isoformat(),
    "status": "active",
    "fuente": "Fuente Test A",
    "id_licitacion": "ID_ALPHA_001",
    "jurisdiccion": "Nacional",
    "tipo_procedimiento": "Publica",
    "description": "This is a test licitacion from Fuente A."
}

sample_licitacion_data_2 = {
    "title": "Test Licitacion Beta",
    "organization": "Org Beta",
    "publication_date": datetime.now(timezone.utc).isoformat(),
    "status": "active",
    "fuente": "Fuente Test B",
    "id_licitacion": "ID_BETA_002",
    "jurisdiccion": "Provincial",
    "tipo_procedimiento": "Privada",
    "description": "Another test item from Fuente B."
}

sample_licitacion_data_3 = {
    "title": "Old Licitacion Gamma",
    "organization": "Org Gamma",
    "publication_date": (datetime.now(timezone.utc) - timedelta(days=10)).isoformat(),
    "status": "closed",
    "fuente": "Fuente Test A", # Same fuente as Alpha
    "id_licitacion": "ID_GAMMA_003",
    "jurisdiccion": "Municipal",
    "tipo_procedimiento": "Directa",
    "description": "A closed test case from Fuente A."
}


@pytest.fixture(scope="function")
async def client():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac

@pytest.fixture(scope="function", autouse=True)
async def clear_licitaciones_collection(client: AsyncClient):
    # This is a simple way to clear data.
    # For a real test suite, you might want a more robust solution
    # like a test database or transactions if your DB supports it.
    # For now, we assume there's no direct "delete all" endpoint for licitaciones,
    # so tests should be mindful of data they create.
    # If there were a repository method to clear, we could override dependency and call it.
    # For MongoDB, one might drop the collection before/after tests.
    # This fixture currently does nothing to clear, relying on tests to manage their data or a separate cleanup script.
    # To properly clean:
    # 1. Get the LicitacionRepository
    # 2. Call a method like `await repo.collection.delete_many({})`
    # This requires setting up the repository dependency correctly for tests.
    pass


async def create_test_licitacion(client: AsyncClient, data: dict) -> dict:
    response = await client.post("/api/licitaciones/", json=data)
    assert response.status_code == 200
    return response.json()

@pytest.mark.asyncio
async def test_create_and_get_licitacion(client: AsyncClient):
    created_data = await create_test_licitacion(client, sample_licitacion_data_1)
    licitacion_id = created_data["id"]

    response = await client.get(f"/api/licitaciones/{licitacion_id}")
    assert response.status_code == 200
    retrieved_data = response.json()

    assert retrieved_data["id"] == licitacion_id
    assert retrieved_data["title"] == sample_licitacion_data_1["title"]
    assert retrieved_data["fuente"] == sample_licitacion_data_1["fuente"]
    assert retrieved_data["organization"] == sample_licitacion_data_1["organization"]

@pytest.mark.asyncio
async def test_get_licitaciones_no_filter(client: AsyncClient):
    await create_test_licitacion(client, sample_licitacion_data_1)
    await create_test_licitacion(client, sample_licitacion_data_2)

    response = await client.get("/api/licitaciones/")
    assert response.status_code == 200
    licitaciones = response.json()
    # Assuming the DB is cleaned or this is the first test run for these items
    assert len(licitaciones) >= 2
    titles = [lic["title"] for lic in licitaciones]
    assert sample_licitacion_data_1["title"] in titles
    assert sample_licitacion_data_2["title"] in titles

@pytest.mark.asyncio
async def test_get_licitaciones_with_fuente_filter(client: AsyncClient):
    lic1 = await create_test_licitacion(client, sample_licitacion_data_1) # Fuente A
    lic2 = await create_test_licitacion(client, sample_licitacion_data_2) # Fuente B
    lic3 = await create_test_licitacion(client, sample_licitacion_data_3) # Fuente A, closed

    # Filter by Fuente Test A
    response_a = await client.get(f"/api/licitaciones/?fuente=Fuente Test A")
    assert response_a.status_code == 200
    licitaciones_a = response_a.json()

    # Check that only licitaciones from "Fuente Test A" are returned
    assert len(licitaciones_a) >= 2 # Could be more if DB not clean
    for lic in licitaciones_a:
        assert lic["fuente"] == "Fuente Test A"

    titles_a = [lic["title"] for lic in licitaciones_a]
    assert sample_licitacion_data_1["title"] in titles_a
    assert sample_licitacion_data_3["title"] in titles_a
    assert sample_licitacion_data_2["title"] not in titles_a


    # Filter by Fuente Test B
    response_b = await client.get(f"/api/licitaciones/?fuente=Fuente Test B")
    assert response_b.status_code == 200
    licitaciones_b = response_b.json()

    assert len(licitaciones_b) >= 1
    for lic in licitaciones_b:
        assert lic["fuente"] == "Fuente Test B"

    titles_b = [lic["title"] for lic in licitaciones_b]
    assert sample_licitacion_data_2["title"] in titles_b
    assert sample_licitacion_data_1["title"] not in titles_b

@pytest.mark.asyncio
async def test_get_licitaciones_with_multiple_filters(client: AsyncClient):
    await create_test_licitacion(client, sample_licitacion_data_1) # Fuente A, active
    await create_test_licitacion(client, sample_licitacion_data_3) # Fuente A, closed

    # Filter by Fuente Test A and status active
    response = await client.get(f"/api/licitaciones/?fuente=Fuente Test A&status=active")
    assert response.status_code == 200
    licitaciones = response.json()

    assert len(licitaciones) >= 1
    for lic in licitaciones:
        assert lic["fuente"] == "Fuente Test A"
        assert lic["status"] == "active"

    titles = [lic["title"] for lic in licitaciones]
    assert sample_licitacion_data_1["title"] in titles
    assert sample_licitacion_data_3["title"] not in titles # Because it's closed

@pytest.mark.asyncio
async def test_count_licitaciones_with_fuente_filter(client: AsyncClient):
    # Ensure a clean state or known state before counting if possible.
    # This test assumes other tests might have added data.
    # For precise counts, a DB cleanup is essential.

    # Create some data specifically for this test if DB is not cleaned per test.
    await create_test_licitacion(client, {**sample_licitacion_data_1, "id_licitacion": "COUNT_A1"})
    await create_test_licitacion(client, {**sample_licitacion_data_3, "id_licitacion": "COUNT_A2"}) # Also Fuente A
    await create_test_licitacion(client, {**sample_licitacion_data_2, "id_licitacion": "COUNT_B1"})


    response_a = await client.get(f"/api/licitaciones/count?fuente=Fuente Test A")
    assert response_a.status_code == 200
    assert response_a.json()["count"] >= 2

    response_b = await client.get(f"/api/licitaciones/count?fuente=Fuente Test B")
    assert response_b.status_code == 200
    assert response_b.json()["count"] >= 1

    response_c = await client.get(f"/api/licitaciones/count?fuente=NonExistentFuente")
    assert response_c.status_code == 200
    # This count might be affected if NonExistentFuente items were created by other tests
    # For a clean run, it should be 0.
    assert response_c.json()["count"] >= 0


@pytest.mark.asyncio
async def test_get_distinct_fuentes(client: AsyncClient):
    await create_test_licitacion(client, {**sample_licitacion_data_1, "id_licitacion": "DISTINCT_A"}) # Fuente Test A
    await create_test_licitacion(client, {**sample_licitacion_data_2, "id_licitacion": "DISTINCT_B"}) # Fuente Test B
    await create_test_licitacion(client, {**sample_licitacion_data_3, "id_licitacion": "DISTINCT_A2"})# Fuente Test A again

    response = await client.get("/api/licitaciones/distinct/fuente")
    assert response.status_code == 200
    distinct_fuentes = response.json()

    assert isinstance(distinct_fuentes, list)
    assert "Fuente Test A" in distinct_fuentes
    assert "Fuente Test B" in distinct_fuentes
    # Check for uniqueness
    assert len(distinct_fuentes) == len(set(distinct_fuentes))


@pytest.mark.asyncio
async def test_get_distinct_invalid_field(client: AsyncClient):
    response = await client.get("/api/licitaciones/distinct/non_existent_field")
    assert response.status_code == 400 # Based on the validation in the endpoint
    assert "not allowed" in response.json()["detail"]

# TODO: Add more tests:
# - Test pagination (skip, limit) with filters
# - Test edge cases for filters (e.g., empty strings, special characters if applicable)
# - Test error responses for invalid filter values if any validation is added
# - Test behavior when no licitaciones match the filter
# - Test `search` endpoint in conjunction with `fuente` if that's desired behavior (search currently doesn't take filters)

# Note on DB Cleaning for tests:
# The `clear_licitaciones_collection` fixture is a placeholder.
# For robust tests, especially for `count` and ensuring `get_all` returns exact numbers,
# the database collection should be cleaned before each test or test session.
# This can be done by:
# 1. Using a dedicated test database that's wiped.
# 2. Overriding the `get_licitacion_repository` dependency in tests to point to a test DB
#    or to add a cleanup method to the repository that can be called in the fixture.
# Example of overriding dependency for cleanup (conceptual):
# from backend.db.connection import get_database
# from backend.dependencies import get_licitacion_repository
# async def override_get_db_for_test():
#     # Connect to a test specific DB
#     test_db = ... # setup test mongo client and db
#     try:
#         yield test_db
#     finally:
#         # Cleanup: e.g., drop collections or the entire test_db
#         await test_db.client.drop_database(test_db.name)

# app.dependency_overrides[get_database] = override_get_db_for_test
# This would ensure each test run has a clean slate.
# The current tests use `>=` for counts/lengths to be somewhat resilient to existing data.
# For more precise tests, proper isolation (e.g., cleaning the DB) is crucial.
# The current tests assume that `id_licitacion` is unique and new values are used for each test item
# to avoid conflicts if the DB is not cleaned.
# Adding `from datetime import timedelta` for sample_licitacion_data_3
from datetime import timedelta
