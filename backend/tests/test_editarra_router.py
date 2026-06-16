import os
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from backend.routers import editarra


class FakeUpdateResult:
    def __init__(self, matched_count: int = 0):
        self.matched_count = matched_count


class FakeDeleteResult:
    def __init__(self, deleted_count: int = 0):
        self.deleted_count = deleted_count


class FakeCursor:
    def __init__(self, docs):
        self.docs = list(docs)

    def sort(self, key, direction):
        reverse = direction < 0
        self.docs.sort(key=lambda item: item.get(key, ""), reverse=reverse)
        return self

    async def to_list(self, length=100):
        return self.docs[:length]


class FakeCollection:
    def __init__(self):
        self.docs = {}

    def _project(self, doc, projection):
        if not doc:
            return None
        if projection and projection.get("_id") == 0:
            return {key: value for key, value in doc.items() if key != "_id"}
        return dict(doc)

    def _matches(self, doc, query):
        return all(doc.get(key) == value for key, value in query.items())

    def find(self, query=None, projection=None):
        query = query or {}
        return FakeCursor([
            self._project(doc, projection)
            for doc in self.docs.values()
            if self._matches(doc, query)
        ])

    async def find_one(self, query, projection=None):
        for doc in self.docs.values():
            if self._matches(doc, query):
                return self._project(doc, projection)
        return None

    async def insert_one(self, doc):
        doc["_id"] = object()
        self.docs[doc["id"]] = dict(doc)
        return SimpleNamespace(inserted_id=doc["id"])

    async def update_one(self, query, update, upsert=False):
        target = await self.find_one(query)
        matched = 1 if target else 0
        if not target and not upsert:
            return FakeUpdateResult(0)

        doc_id = query.get("id") or update.get("$set", {}).get("id")
        existing = dict(self.docs.get(doc_id, {}))
        if not existing:
            existing.update(update.get("$setOnInsert", {}))
        existing.update(update.get("$set", {}))
        if doc_id:
            existing["id"] = doc_id
            self.docs[doc_id] = existing
        return FakeUpdateResult(matched)

    async def delete_one(self, query):
        doc = await self.find_one(query)
        if not doc:
            return FakeDeleteResult(0)
        self.docs.pop(doc["id"], None)
        return FakeDeleteResult(1)


@pytest.fixture()
def editarra_app(monkeypatch):
    monkeypatch.setenv("ENV", "test")
    monkeypatch.setenv("EDITARRA_OPERATOR_KEY", "test-key")
    app = FastAPI()
    app.mongodb = SimpleNamespace(
      editarra_agendas=FakeCollection(),
      editarra_candidates=FakeCollection(),
      editarra_discovery_runs=FakeCollection(),
    )
    app.include_router(editarra.router)
    return app


@pytest.fixture()
def headers():
    return {"X-EDITARRA-KEY": "test-key"}


@pytest.mark.asyncio
async def test_editarra_requires_operator_key(editarra_app):
    transport = ASGITransport(app=editarra_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/editarra/agendas")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_editarra_allows_open_access_without_operator_key(monkeypatch):
    monkeypatch.setenv("ENV", "test")
    monkeypatch.delenv("EDITARRA_OPERATOR_KEY", raising=False)
    app = FastAPI()
    app.mongodb = SimpleNamespace(
      editarra_agendas=FakeCollection(),
      editarra_candidates=FakeCollection(),
      editarra_discovery_runs=FakeCollection(),
    )
    app.include_router(editarra.router)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/editarra/agendas")

    assert response.status_code == 200
    assert response.json() == {"agendas": []}


@pytest.mark.asyncio
async def test_editarra_agenda_crud(editarra_app, headers):
    transport = ASGITransport(app=editarra_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post("/api/editarra/agendas", headers=headers, json={
            "id": "agenda-test",
            "name": "Agenda Test",
            "destination": "editarra-studio",
            "interests": ["datos auditables"],
            "tropesToSeek": ["norma nueva"],
            "tropesToAvoid": ["clickbait"],
            "sourceUrls": ["https://example.com/feed"],
        })
        listed = await client.get("/api/editarra/agendas", headers=headers)
        updated = await client.put("/api/editarra/agendas/agenda-test", headers=headers, json={
            "id": "agenda-test",
            "name": "Agenda Actualizada",
            "destination": "editarra-studio",
            "interests": ["compras públicas"],
            "tropesToSeek": ["licitación relevante"],
            "sourceUrls": ["https://example.com/feed"],
        })
        deleted = await client.delete("/api/editarra/agendas/agenda-test", headers=headers)

    assert created.status_code == 200
    assert created.json()["agenda"]["id"] == "agenda-test"
    assert listed.status_code == 200
    assert listed.json()["agendas"][0]["name"] == "Agenda Test"
    assert updated.status_code == 200
    assert updated.json()["agenda"]["name"] == "Agenda Actualizada"
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True, "id": "agenda-test"}


@pytest.mark.asyncio
async def test_discovery_run_scores_candidates_and_converts(editarra_app, headers, monkeypatch):
    async def fake_fetch_url(session, url):
        warnings = editarra.warn_url(url)
        if url.startswith("ftp://"):
            return {"url": url, "ok": False, "warnings": warnings, "error": "scheme_not_allowed"}
        if url == "https://example.com/feed":
            return {
                "url": url,
                "ok": True,
                "warnings": warnings,
                "html": """
                  <html><head><title>Example feed</title></head>
                  <body>
                    <a href="/news/arca-cctv">ARCA CCTV fiscal con datos auditables</a>
                  </body></html>
                """,
            }
        if url == "https://example.com/news/arca-cctv":
            return {
                "url": url,
                "ok": True,
                "warnings": warnings,
                "html": """
                  <html><head><title>ARCA CCTV fiscal</title></head>
                  <body>La norma nueva exige evidencia, datos auditables y trazabilidad diaria para pymes argentinas.</body></html>
                """,
            }
        return {
            "url": url,
            "ok": True,
            "warnings": warnings,
            "html": """
              <html><head><title>ARCA CCTV fiscal</title></head>
              <body>La norma nueva exige evidencia, datos auditables y trazabilidad diaria para pymes argentinas.</body></html>
            """,
        }

    monkeypatch.setattr(editarra, "fetch_url", fake_fetch_url)
    transport = ASGITransport(app=editarra_app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/editarra/agendas", headers=headers, json={
            "id": "agenda-test",
            "name": "Agenda Test",
            "destination": "editarra-studio",
            "compatibleAuthors": ["Editor UMSA Diaria"],
            "compatibleRecipes": ["reactiva"],
            "compatibleOperationModes": ["modo-alerta-regulatoria"],
            "interests": ["datos auditables", "pymes argentinas"],
            "tropesToSeek": ["norma nueva exige evidencia"],
            "tropesToAvoid": ["clickbait"],
            "sourceUrls": ["https://example.com/feed", "ftp://bad.test/feed"],
            "publishingSlots": ["09:00 -03:00"],
        })
        discovery = await client.post("/api/editarra/discovery/run", headers=headers, json={
            "agendaId": "agenda-test",
            "query": "datos auditables",
            "urls": ["https://example.com/feed", "http://127.0.0.1/feed", "ftp://bad.test/feed"],
        })
        runs_response = await client.get("/api/editarra/runs", headers=headers, params={"agendaId": "agenda-test"})
        candidate = discovery.json()["candidates"][0]
        patched = await client.patch(
            f"/api/editarra/candidates/{candidate['id']}",
            headers=headers,
            json={"status": "preseleccionado"},
        )
        topic_response = await client.post(
            f"/api/editarra/candidates/{candidate['id']}/convert-topic",
            headers=headers,
        )
        noterun_response = await client.post(
            f"/api/editarra/candidates/{candidate['id']}/convert-noterun",
            headers=headers,
        )

    assert discovery.status_code == 200
    assert runs_response.status_code == 200
    assert runs_response.json()["runs"][0]["agendaId"] == "agenda-test"
    payload = discovery.json()
    assert payload["run"]["sourceCount"] == 4
    assert payload["run"]["candidateCount"] == 2
    assert "https://example.com/news/arca-cctv" in payload["run"]["urls"]
    assert any("expandió" in warning for warning in payload["run"]["warnings"])
    assert any("URL privada" in warning for warning in payload["run"]["warnings"])
    assert any("scheme_not_allowed" in warning for warning in payload["run"]["warnings"])
    assert candidate["score"] >= 80
    assert candidate["detectedTrope"] == "norma nueva exige evidencia"
    assert patched.status_code == 200
    assert patched.json()["candidate"]["status"] == "preseleccionado"
    assert topic_response.status_code == 200
    assert topic_response.json()["topic"]["candidateId"] == candidate["id"]
    assert topic_response.json()["topic"]["destinationProfileId"] == "editarra-studio"
    assert noterun_response.status_code == 200
    assert noterun_response.json()["noteRun"]["status"] == "preparado"


@pytest.mark.asyncio
async def test_discovery_timeout_warning_is_controlled(editarra_app, headers, monkeypatch):
    async def fake_fetch_url(session, url):
        return {"url": url, "ok": False, "warnings": ["Timeout al consultar fuente."], "error": "timeout"}

    monkeypatch.setattr(editarra, "fetch_url", fake_fetch_url)
    transport = ASGITransport(app=editarra_app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/editarra/agendas", headers=headers, json={
            "id": "agenda-timeout",
            "name": "Agenda Timeout",
            "sourceUrls": ["https://example.com/slow"],
        })
        discovery = await client.post("/api/editarra/discovery/run", headers=headers, json={
            "agendaId": "agenda-timeout",
            "query": "slow",
        })

    assert discovery.status_code == 200
    payload = discovery.json()
    assert payload["run"]["status"] == "parcial"
    assert payload["candidates"] == []
    assert payload["run"]["seedResults"][0]["ok"] is False
    assert payload["run"]["seedResults"][0]["error"] == "timeout"
    assert payload["run"]["failedSources"][0]["kind"] == "semilla"
    assert any("timeout" in warning.lower() for warning in payload["run"]["warnings"])


@pytest.mark.asyncio
async def test_discovery_consults_all_configured_seed_urls_above_legacy_limit(editarra_app, headers, monkeypatch):
    fetched_urls = []

    async def fake_fetch_url(session, url):
        fetched_urls.append(url)
        return {
            "url": url,
            "requestedUrl": url,
            "ok": True,
            "warnings": [],
            "contentType": "text/html",
            "html": f"""
              <html><head><title>Fuente {url}</title></head>
              <body>Norma nueva exige evidencia con datos auditables para pymes argentinas.</body></html>
            """,
        }

    seed_urls = [f"https://fuente-{index}.example.com/nota" for index in range(22)]

    monkeypatch.setattr(editarra, "fetch_url", fake_fetch_url)
    monkeypatch.setattr(editarra, "deepseek_discovery_enabled", lambda: False)
    transport = ASGITransport(app=editarra_app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/editarra/agendas", headers=headers, json={
            "id": "agenda-22",
            "name": "Agenda 22 fuentes",
            "destination": "editarra-studio",
            "compatibleAuthors": ["Editor UMSA Diaria"],
            "compatibleRecipes": ["reactiva"],
            "compatibleOperationModes": ["modo-alerta-regulatoria"],
            "interests": ["datos auditables", "pymes argentinas"],
            "tropesToSeek": ["norma nueva exige evidencia"],
            "sourceUrls": seed_urls,
        })
        discovery = await client.post("/api/editarra/discovery/run", headers=headers, json={
            "agendaId": "agenda-22",
            "query": "datos auditables pymes",
        })

    payload = discovery.json()
    assert discovery.status_code == 200
    assert fetched_urls == seed_urls
    assert payload["run"]["sourceCount"] == 22
    assert payload["run"]["urls"] == seed_urls
    assert payload["run"]["candidateCount"] == editarra.DEEPSEEK_DISCOVERY_MAX_CANDIDATES
    assert len(payload["run"]["seedResults"]) == 22
    assert payload["run"]["expandedResults"] == []
    assert payload["run"]["failedSources"] == []
    assert payload["run"]["candidateDistribution"]["uniqueHosts"] == editarra.DEEPSEEK_DISCOVERY_MAX_CANDIDATES
    assert all(item["kind"] == "semilla" and item["ok"] for item in payload["run"]["seedResults"])
    assert any("22 URLs semilla" in warning for warning in payload["run"]["warnings"])


@pytest.mark.asyncio
async def test_discovery_candidates_are_fresh_per_run_even_for_same_sources(editarra_app, headers, monkeypatch):
    async def fake_fetch_url(session, url):
        return {
            "url": url,
            "requestedUrl": url,
            "ok": True,
            "warnings": [],
            "contentType": "text/html",
            "html": """
              <html><head><title>PostgreSQL evidencia operativa</title></head>
              <body>Datos auditables para pymes argentinas, software libre aplicado y evidencia operativa.</body></html>
            """,
        }

    monkeypatch.setattr(editarra, "fetch_url", fake_fetch_url)
    monkeypatch.setattr(editarra, "deepseek_discovery_enabled", lambda: False)
    transport = ASGITransport(app=editarra_app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/editarra/agendas", headers=headers, json={
            "id": "agenda-run-fresco",
            "name": "Agenda run fresco",
            "destination": "editarra-studio",
            "compatibleAuthors": ["Editor UMSA Diaria"],
            "compatibleRecipes": ["reactiva"],
            "compatibleOperationModes": ["modo-alerta-regulatoria"],
            "interests": ["datos auditables", "pymes argentinas", "software libre aplicado"],
            "tropesToSeek": ["evidencia operativa"],
            "sourceUrls": ["https://www.postgresql.org/about/news/postgresql-audit"],
        })
        first = await client.post("/api/editarra/discovery/run", headers=headers, json={
            "agendaId": "agenda-run-fresco",
            "query": "postgresql evidencia",
        })
        second = await client.post("/api/editarra/discovery/run", headers=headers, json={
            "agendaId": "agenda-run-fresco",
            "query": "postgresql evidencia",
        })
        listed = await client.get("/api/editarra/candidates", headers=headers, params={"agendaId": "agenda-run-fresco"})

    first_payload = first.json()
    second_payload = second.json()
    first_candidate = first_payload["candidates"][0]
    second_candidate = second_payload["candidates"][0]
    persisted_ids = {candidate["id"] for candidate in listed.json()["candidates"]}
    persisted_run_ids = {candidate["runId"] for candidate in listed.json()["candidates"]}

    assert first.status_code == 200
    assert second.status_code == 200
    assert first_payload["run"]["id"] != second_payload["run"]["id"]
    assert first_candidate["sourceUrl"] == second_candidate["sourceUrl"]
    assert first_candidate["id"] != second_candidate["id"]
    assert first_candidate["runId"] == first_payload["run"]["id"]
    assert second_candidate["runId"] == second_payload["run"]["id"]
    assert {first_candidate["id"], second_candidate["id"]}.issubset(persisted_ids)
    assert {first_payload["run"]["id"], second_payload["run"]["id"]}.issubset(persisted_run_ids)


@pytest.mark.asyncio
async def test_umsa_agenda_protects_source_urls_from_stale_clients(editarra_app, headers, monkeypatch):
    stale_urls = [
        "https://www.argentina.gob.ar/noticias",
        "https://www.postgresql.org/about/newsarchive/",
    ]
    fetched_urls = []

    async def fake_fetch_url(session, url):
        fetched_urls.append(url)
        return {
            "url": url,
            "requestedUrl": url,
            "ok": True,
            "warnings": [],
            "contentType": "text/html",
            "html": f"""
              <html><head><title>Fuente protegida {url}</title></head>
              <body>Datos auditables para pymes argentinas, software libre aplicado y evidencia operativa.</body></html>
            """,
        }

    monkeypatch.setattr(editarra, "fetch_url", fake_fetch_url)
    monkeypatch.setattr(editarra, "deepseek_discovery_enabled", lambda: False)
    transport = ASGITransport(app=editarra_app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post("/api/editarra/agendas", headers=headers, json={
            "id": "agenda-umsa-diaria",
            "name": "UMSA Diaria stale",
            "destination": "editarra-studio",
            "compatibleAuthors": ["Editor UMSA Diaria"],
            "compatibleRecipes": ["reactiva"],
            "compatibleOperationModes": ["modo-alerta-regulatoria"],
            "interests": ["datos auditables", "pymes argentinas", "software libre aplicado"],
            "tropesToSeek": ["norma nueva"],
            "sourceUrls": stale_urls,
        })
        updated = await client.put("/api/editarra/agendas/agenda-umsa-diaria", headers=headers, json={
            "id": "agenda-umsa-diaria",
            "name": "UMSA Diaria stale",
            "destination": "editarra-studio",
            "compatibleAuthors": ["Editor UMSA Diaria"],
            "compatibleRecipes": ["reactiva"],
            "compatibleOperationModes": ["modo-alerta-regulatoria"],
            "interests": ["datos auditables", "pymes argentinas", "software libre aplicado"],
            "tropesToSeek": ["norma nueva"],
            "sourceUrls": stale_urls[:1],
        })
        discovery = await client.post("/api/editarra/discovery/run", headers=headers, json={
            "agendaId": "agenda-umsa-diaria",
            "query": "datos auditables pymes",
            "urls": stale_urls[:1],
        })

    created_urls = created.json()["agenda"]["sourceUrls"]
    updated_urls = updated.json()["agenda"]["sourceUrls"]
    payload = discovery.json()

    assert created.status_code == 200
    assert updated.status_code == 200
    assert discovery.status_code == 200
    assert len(created_urls) >= 22
    assert len(updated_urls) >= 22
    assert "https://www.argentina.gob.ar/noticias" not in updated_urls
    assert "https://www.eff.org/deeplinks" in updated_urls
    assert "https://www.argentina.gob.ar/noticias" not in payload["run"]["urls"]
    assert "https://www.metabase.com/blog" in payload["run"]["urls"]
    assert len(payload["run"]["urls"]) >= 22
    assert len(fetched_urls) >= 22


@pytest.mark.asyncio
async def test_discovery_diversifies_candidates_by_source_host(editarra_app, headers, monkeypatch):
    seed_urls = [
        "https://www.argentina.gob.ar/noticias/uno",
        "https://www.argentina.gob.ar/noticias/dos",
        "https://www.argentina.gob.ar/noticias/tres",
        "https://www.postgresql.org/about/news/postgresql-audit",
        "https://datos.gob.ar/dataset/apertura",
        "https://www.cnv.gov.ar/sitioweb/noticias/datos",
    ]

    async def fake_fetch_url(session, url):
        return {
            "url": url,
            "requestedUrl": url,
            "ok": True,
            "warnings": [],
            "contentType": "text/html",
            "html": f"""
              <html><head><title>Fuente {url}</title></head>
              <body>Datos auditables para pymes argentinas, software libre aplicado y evidencia operativa.</body></html>
            """,
        }

    async def fake_generate_deepseek_candidates(agenda, query, fetched_results, run_id):
        repeated = []
        for index, url in enumerate(seed_urls[:4]):
            repeated.append({
                "id": f"cand-llm-{index}",
                "runId": run_id,
                "agendaId": agenda["id"],
                "title": f"LLM tema {index}",
                "summary": "Tema detectado por DeepSeek.",
                "sourceName": editarra.source_host_key(url),
                "sourceUrl": url,
                "snippet": "Datos auditables para pymes argentinas.",
                "detectedTrope": "norma nueva",
                "matchedInterests": ["datos auditables"],
                "recommendedAuthor": "Editor UMSA Diaria",
                "recommendedRecipeId": "reactiva",
                "recommendedOperationModeId": "modo-alerta-regulatoria",
                "score": 95 - index,
                "warnings": [],
                "status": "descubierto",
                "createdAt": editarra.utc_now_iso(),
                "updatedAt": editarra.utc_now_iso(),
            })
        return {
            "provider": "deepseek-web",
            "llmModel": "deepseek-v4-flash",
            "warnings": [],
            "candidates": repeated,
        }

    monkeypatch.setattr(editarra, "fetch_url", fake_fetch_url)
    monkeypatch.setattr(editarra, "deepseek_discovery_enabled", lambda: True)
    monkeypatch.setattr(editarra, "generate_deepseek_candidates", fake_generate_deepseek_candidates)
    transport = ASGITransport(app=editarra_app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/editarra/agendas", headers=headers, json={
            "id": "agenda-diversidad",
            "name": "Agenda diversidad",
            "destination": "editarra-studio",
            "compatibleAuthors": ["Editor UMSA Diaria"],
            "compatibleRecipes": ["reactiva"],
            "compatibleOperationModes": ["modo-alerta-regulatoria"],
            "interests": ["datos auditables", "pymes argentinas", "software libre aplicado"],
            "tropesToSeek": ["norma nueva"],
            "sourceUrls": seed_urls,
        })
        discovery = await client.post("/api/editarra/discovery/run", headers=headers, json={
            "agendaId": "agenda-diversidad",
            "query": "datos auditables pymes",
        })

    payload = discovery.json()
    hosts = [editarra.source_host_key(candidate["sourceUrl"]) for candidate in payload["candidates"]]
    assert discovery.status_code == 200
    assert [candidate["runOrder"] for candidate in payload["candidates"]] == list(range(len(payload["candidates"])))
    assert hosts.count("argentina.gob.ar") <= editarra.DISCOVERY_MAX_CANDIDATES_PER_HOST
    assert "datos.gob.ar" in hosts
    assert "cnv.gov.ar" in hosts
    assert payload["run"]["candidateDistribution"]["byHost"]["argentina.gob.ar"] <= editarra.DISCOVERY_MAX_CANDIDATES_PER_HOST
    assert payload["run"]["candidateDistribution"]["uniqueHosts"] >= 4
    assert any("máximo" in warning for warning in payload["run"]["warnings"])


@pytest.mark.asyncio
async def test_discovery_promotes_source_coverage_when_llm_repeats_two_hosts(editarra_app, headers, monkeypatch):
    seed_urls = [
        "https://www.argentina.gob.ar/noticias/uno",
        "https://www.argentina.gob.ar/noticias/dos",
        "https://www.postgresql.org/about/news/postgresql-audit",
        "https://datos.gob.ar/dataset/apertura",
        "https://www.cnv.gov.ar/sitioweb/noticias/datos",
        "https://www.bcra.gob.ar/noticias/software",
        "https://www.metabase.com/blog/audit",
        "https://www.docker.com/blog/open-data",
    ]

    async def fake_fetch_url(session, url):
        return {
            "url": url,
            "requestedUrl": url,
            "ok": True,
            "warnings": [],
            "contentType": "text/html",
            "html": f"""
              <html><head><title>Fuente diversa {url}</title></head>
              <body>Datos auditables, pymes argentinas, software libre aplicado y evidencia operativa.</body></html>
            """,
        }

    async def fake_generate_deepseek_candidates(agenda, query, fetched_results, run_id):
        repeated_urls = [
            seed_urls[0],
            seed_urls[1],
            seed_urls[0],
            seed_urls[1],
            seed_urls[2],
            seed_urls[2],
            seed_urls[0],
            seed_urls[1],
        ]
        return {
            "provider": "deepseek-web",
            "llmModel": "deepseek-v4-flash",
            "warnings": [],
            "candidates": [{
                "id": f"cand-repetido-{index}",
                "runId": run_id,
                "agendaId": agenda["id"],
                "title": f"Tema repetido {index}",
                "summary": "Tema repetido por DeepSeek.",
                "sourceName": editarra.source_host_key(url),
                "sourceUrl": url,
                "snippet": "Datos auditables para pymes argentinas.",
                "detectedTrope": "norma nueva",
                "matchedInterests": ["datos auditables"],
                "recommendedAuthor": "Editor UMSA Diaria",
                "recommendedRecipeId": "reactiva",
                "recommendedOperationModeId": "modo-alerta-regulatoria",
                "score": 98 - index,
                "warnings": [],
                "status": "descubierto",
                "createdAt": editarra.utc_now_iso(),
                "updatedAt": editarra.utc_now_iso(),
            } for index, url in enumerate(repeated_urls)],
        }

    monkeypatch.setattr(editarra, "fetch_url", fake_fetch_url)
    monkeypatch.setattr(editarra, "deepseek_discovery_enabled", lambda: True)
    monkeypatch.setattr(editarra, "generate_deepseek_candidates", fake_generate_deepseek_candidates)
    transport = ASGITransport(app=editarra_app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/editarra/agendas", headers=headers, json={
            "id": "agenda-cobertura",
            "name": "Agenda cobertura",
            "destination": "editarra-studio",
            "compatibleAuthors": ["Editor UMSA Diaria"],
            "compatibleRecipes": ["reactiva"],
            "compatibleOperationModes": ["modo-alerta-regulatoria"],
            "interests": ["datos auditables", "pymes argentinas", "software libre aplicado"],
            "tropesToSeek": ["norma nueva"],
            "sourceUrls": seed_urls,
        })
        discovery = await client.post("/api/editarra/discovery/run", headers=headers, json={
            "agendaId": "agenda-cobertura",
            "query": "datos auditables pymes",
        })

    payload = discovery.json()
    hosts = [editarra.source_host_key(candidate["sourceUrl"]) for candidate in payload["candidates"]]
    assert discovery.status_code == 200
    assert len(set(hosts[:5])) >= 5
    assert [candidate["runOrder"] for candidate in payload["candidates"]] == list(range(len(payload["candidates"])))
    assert len(set(hosts)) >= 6
    assert payload["run"]["candidateDistribution"]["uniqueHosts"] >= 6
    assert payload["run"]["candidateDistribution"]["byHost"]["argentina.gob.ar"] <= editarra.DISCOVERY_MAX_CANDIDATES_PER_HOST


@pytest.mark.asyncio
async def test_discovery_run_skips_irrelevant_generic_sources(editarra_app, headers, monkeypatch):
    async def fake_fetch_url(session, url):
        warnings = editarra.warn_url(url)
        if url == "https://example.com/feed":
            return {
                "url": url,
                "ok": True,
                "warnings": warnings,
                "html": """
                  <html><head><title>Example feed</title></head>
                  <body>
                    <a href="/news/cultura-general">Agenda cultural del fin de semana</a>
                    <a href="/news/postgres-pymes">PostgreSQL suma mejoras de auditoría para pymes</a>
                  </body></html>
                """,
            }
        if url == "https://example.com/news/cultura-general":
            return {
                "url": url,
                "ok": True,
                "warnings": warnings,
                "html": """
                  <html><head><title>Agenda cultural del fin de semana</title></head>
                  <body>Festival, música, agenda de cultura y actividades del fin de semana.</body></html>
                """,
            }
        if url == "https://example.com/news/postgres-pymes":
            return {
                "url": url,
                "ok": True,
                "warnings": warnings,
                "html": """
                  <html><head><title>PostgreSQL suma mejoras de auditoría para pymes</title></head>
                  <body>PostgreSQL incorpora mejoras de auditoría y datos auditables para pymes argentinas con evidencia operativa.</body></html>
                """,
            }
        return {"url": url, "ok": False, "warnings": warnings, "error": "not_found"}

    monkeypatch.setattr(editarra, "fetch_url", fake_fetch_url)
    monkeypatch.setattr(editarra, "deepseek_discovery_enabled", lambda: False)
    transport = ASGITransport(app=editarra_app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/editarra/agendas", headers=headers, json={
            "id": "agenda-test",
            "name": "Agenda Test",
            "destination": "editarra-studio",
            "compatibleAuthors": ["Editor UMSA Diaria"],
            "compatibleRecipes": ["reactiva"],
            "compatibleOperationModes": ["modo-alerta-regulatoria"],
            "interests": ["datos auditables", "pymes argentinas", "postgresql"],
            "tropesToSeek": ["evidencia operativa"],
            "tropesToAvoid": ["clickbait"],
            "sourceUrls": ["https://example.com/feed"],
            "publishingSlots": ["09:00 -03:00"],
        })
        discovery = await client.post("/api/editarra/discovery/run", headers=headers, json={
            "agendaId": "agenda-test",
            "query": "postgresql auditoria pymes",
            "urls": ["https://example.com/feed"],
        })

    assert discovery.status_code == 200
    titles = [candidate["title"] for candidate in discovery.json()["candidates"]]
    assert "PostgreSQL suma mejoras de auditoría para pymes" in titles
    assert "Agenda cultural del fin de semana" not in titles


@pytest.mark.asyncio
async def test_discovery_audits_generic_seeds_without_turning_them_into_candidates(editarra_app, headers, monkeypatch):
    seed_urls = [
        "https://blogs.worldbank.org/en/digital-development",
        "https://www.redhat.com/en/blog",
        "https://www.postgresql.org/about/news/postgresql-audit",
    ]

    async def fake_fetch_url(session, url):
        if "worldbank" in url:
            html = """
              <html><head><title>Digital Development</title></head>
              <body>
                <nav>Skip to Main Navigation worldbank.org Page navigation Home All Blogs Topics Contact WB Live Logo SEARCH SEARCH SEARCH</nav>
                Digital Transformation Making technology work for everyone.
              </body></html>
            """
        elif "redhat" in url:
            html = """
              <html><head><title>The official Red Hat blog</title></head>
              <body>{"path":{"baseUrl":"/","pathPrefix":"en/","currentPath":"node/219751"},"currentLanguage":"en"}</body></html>
            """
        else:
            html = """
              <html><head><title>PostgreSQL agrega auditoría operativa para pymes</title></head>
              <body>PostgreSQL publica una guía de software libre aplicado con datos auditables y evidencia operativa para pymes argentinas.</body></html>
            """
        return {
            "url": url,
            "requestedUrl": url,
            "ok": True,
            "warnings": [],
            "contentType": "text/html",
            "html": html,
        }

    monkeypatch.setattr(editarra, "fetch_url", fake_fetch_url)
    monkeypatch.setattr(editarra, "deepseek_discovery_enabled", lambda: False)
    transport = ASGITransport(app=editarra_app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/editarra/agendas", headers=headers, json={
            "id": "agenda-shells",
            "name": "Agenda shells",
            "destination": "editarra-studio",
            "compatibleAuthors": ["Editor UMSA Diaria"],
            "compatibleRecipes": ["reactiva"],
            "compatibleOperationModes": ["modo-alerta-regulatoria"],
            "interests": ["software libre aplicado", "datos auditables", "pymes argentinas"],
            "tropesToSeek": ["evidencia operativa"],
            "sourceUrls": seed_urls,
        })
        discovery = await client.post("/api/editarra/discovery/run", headers=headers, json={
            "agendaId": "agenda-shells",
            "query": "software evidencia pymes",
        })

    payload = discovery.json()
    titles = [candidate["title"] for candidate in payload["candidates"]]
    warnings = [warning for candidate in payload["candidates"] for warning in candidate.get("warnings", [])]

    assert discovery.status_code == 200
    assert payload["run"]["sourceCount"] == 3
    assert len(payload["run"]["seedResults"]) == 3
    assert payload["run"]["candidateCount"] == 1
    assert titles == ["PostgreSQL agrega auditoría operativa para pymes"]
    assert "Digital Development" not in titles
    assert "The official Red Hat blog" not in titles
    assert all("Candidato agregado para cobertura" not in warning for warning in warnings)
    assert any("auditó 2 fuentes" in warning for warning in payload["run"]["warnings"])


def test_extract_indexed_links_prefers_relevant_child_urls():
    agenda = {
        "interests": ["datos auditables", "pymes argentinas"],
        "tropesToSeek": ["norma nueva exige evidencia"],
        "tropesToAvoid": ["clickbait"],
    }
    fetched = {
        "ok": True,
        "url": "https://example.com/noticias",
        "html": """
          <html><body>
            <a href="/news/arca-cctv">ARCA CCTV con datos auditables</a>
            <a href="/about">Quiénes somos</a>
            <a href="https://other.test/post">externo</a>
          </body></html>
        """,
    }

    links = editarra.extract_indexed_links(fetched, agenda, "ARCA evidencia")

    assert links == ["https://example.com/news/arca-cctv"]


def test_extract_indexed_links_explores_article_like_urls_without_exact_query_terms():
    agenda = {
        "interests": ["software libre aplicado", "datos auditables"],
        "tropesToSeek": ["evidencia operativa"],
        "tropesToAvoid": [],
    }
    fetched = {
        "ok": True,
        "url": "https://www.redhat.com/en/blog",
        "html": """
          <html><body>
            <a href="/en/blog/enterprise-linux-automation-public-sector">The official Red Hat blog</a>
            <a href="/en/about/company">About Red Hat</a>
          </body></html>
        """,
    }

    links = editarra.extract_indexed_links(fetched, agenda, "datos auditables pymes")

    assert links == ["https://www.redhat.com/en/blog/enterprise-linux-automation-public-sector"]


def test_detect_matches_supports_english_technical_synonyms():
    text = "Open source observability improves auditability, metadata and compliance for SMEs."

    assert editarra.detect_matches(text, ["software libre aplicado"]) == ["software libre aplicado"]
    assert editarra.detect_matches(text, ["datos auditables"]) == ["datos auditables"]
    assert editarra.detect_matches(text, ["pymes argentinas"]) == []


def test_build_candidate_rejects_product_marketing_without_hard_editorial_signal():
    agenda = {
        "id": "agenda-umsa-diaria",
        "compatibleAuthors": ["Editor UMSA Diaria"],
        "compatibleRecipes": ["reactiva"],
        "compatibleOperationModes": ["modo-alerta-regulatoria"],
        "interests": ["infraestructura abierta", "pymes argentinas", "datos auditables", "software libre aplicado", "regulación operativa"],
        "tropesToSeek": ["norma nueva que exige evidencia"],
        "tropesToAvoid": [],
        "scoringWeights": {"interest": 12, "trope": 18, "source": 8, "avoidPenalty": 24},
    }
    fetched = {
        "url": "https://www.min.io/blog/aistor-table-sharing-connects-databricks-directly-to-on-premises-data-in-aistor",
        "ok": True,
        "warnings": [],
        "contentType": "text/html",
        "html": """
          <html><head><title>MinIO AIStor Table Sharing: Connect Databricks to On-Premises Data</title></head>
          <body>Introducing MinIO MemKV: Purpose-Built Context Memory Store for AI Inference Learn More MinIO AIStor Brings Object Data Stores for the NVIDIA STX.</body></html>
        """,
    }

    candidate = editarra.build_candidate_from_llm_item(
        agenda,
        "software libre aplicado datos auditables pymes evidencia operativa",
        {fetched["url"]: fetched},
        "run-x",
        {
            "sourceUrl": fetched["url"],
            "title": "MinIO AIStor Table Sharing: Connect Databricks to On-Premises Data",
            "summary": "Producto de MinIO para datos on-premises.",
            "detectedTrope": "norma nueva que exige evidencia",
            "matchedInterests": ["pymes argentinas", "datos auditables", "software libre aplicado"],
            "score": 100,
        },
    )

    assert candidate is None


def test_build_candidate_rejects_vendor_reference_architecture_pages():
    agenda = {
        "id": "agenda-umsa-diaria",
        "compatibleAuthors": ["Editor UMSA Diaria"],
        "compatibleRecipes": ["reactiva"],
        "compatibleOperationModes": ["modo-alerta-regulatoria"],
        "interests": ["infraestructura abierta", "datos auditables", "regulación operativa"],
        "tropesToSeek": ["norma nueva que exige evidencia"],
        "tropesToAvoid": [],
        "scoringWeights": {"interest": 12, "trope": 18, "source": 8, "avoidPenalty": 24},
    }
    fetched = {
        "url": "https://www.min.io/blog/aistor-brings-object-data-stores-for-the-nvidia-stx-reference-architecture",
        "ok": True,
        "warnings": [],
        "contentType": "text/html",
        "html": """
          <html><head><title>MinIO AIStor Brings Object Data Stores for the NVIDIA STX Reference Architecture | MinIO</title></head>
          <body>AIStor reference architecture brings object data stores for NVIDIA STX and enterprise data platforms.</body></html>
        """,
    }

    assert editarra.build_candidate_from_fetch(agenda, "datos auditables", fetched, "run-x") is None

    table_sharing = {
        "url": "https://www.min.io/blog/aistor-table-sharing-connects-databricks-directly-to-on-premises-data-in-aistor",
        "ok": True,
        "warnings": [],
        "contentType": "text/html",
        "html": """
          <html><head><title>MinIO AIStor Table Sharing: Connect Databricks to On-Premises Data</title></head>
          <body>AIStor Table Sharing connects Databricks directly to on-premises data and object stores.</body></html>
        """,
    }

    assert editarra.build_candidate_from_fetch(agenda, "datos auditables", table_sharing, "run-x") is None


def test_build_candidate_rejects_event_page_without_operational_signal():
    agenda = {
        "id": "agenda-umsa-diaria",
        "compatibleAuthors": ["Editor UMSA Diaria"],
        "compatibleRecipes": ["reactiva"],
        "compatibleOperationModes": ["modo-alerta-regulatoria"],
        "interests": ["software libre aplicado", "regulación operativa"],
        "tropesToSeek": ["norma nueva que exige evidencia"],
        "tropesToAvoid": [],
        "scoringWeights": {"interest": 12, "trope": 18, "source": 8, "avoidPenalty": 24},
    }
    fetched = {
        "url": "https://opensource.org/blog/maintainer-month-2026-celebrating-the-people-who-keep-open-source-running",
        "ok": True,
        "warnings": [],
        "contentType": "text/html",
        "html": """
          <html><head><title>Maintainer Month 2026: Celebrating the People Who Keep Open Source Running &#8211; Open Source Initiative</title></head>
          <body>May 6, 2026 Events. Maintainer Month 2026 is celebrating maintainers and community events.</body></html>
        """,
    }

    candidate = editarra.build_candidate_from_fetch(
        agenda,
        "software libre aplicado datos auditables pymes evidencia operativa",
        fetched,
        "run-x",
    )

    assert candidate is None


def test_build_candidate_rejects_generic_guides_and_license_pages():
    agenda = {
        "id": "agenda-umsa-diaria",
        "compatibleAuthors": ["Editor UMSA Diaria"],
        "compatibleRecipes": ["reactiva"],
        "compatibleOperationModes": ["modo-alerta-regulatoria"],
        "interests": ["infraestructura abierta", "software libre aplicado", "regulación operativa"],
        "tropesToSeek": ["norma nueva que exige evidencia"],
        "tropesToAvoid": [],
        "scoringWeights": {"interest": 12, "trope": 18, "source": 8, "avoidPenalty": 24},
    }
    generic_pages = [
        {
            "url": "https://www.linuxfoundation.org/resources/open-source-guides",
            "title": "Open Source Guides | Linux Foundation",
            "body": "Open source guides, governance, policy and community resources.",
        },
        {
            "url": "https://www.eff.org/librejs/jslicense",
            "title": "JavaScript license information | Electronic Frontier Foundation",
            "body": "JavaScript license information and software policy details.",
        },
    ]

    for page in generic_pages:
        fetched = {
            "url": page["url"],
            "ok": True,
            "warnings": [],
            "contentType": "text/html",
            "html": f"<html><head><title>{page['title']}</title></head><body>{page['body']}</body></html>",
        }
        assert editarra.build_candidate_from_fetch(agenda, "software libre regulación", fetched, "run-x") is None


def test_build_candidate_rejects_institutional_navigation_shells():
    agenda = {
        "id": "agenda-umsa-diaria",
        "compatibleAuthors": ["Editor UMSA Diaria"],
        "compatibleRecipes": ["reactiva"],
        "compatibleOperationModes": ["modo-alerta-regulatoria"],
        "interests": ["datos auditables", "pymes argentinas", "regulación operativa"],
        "tropesToSeek": ["norma nueva que exige evidencia"],
        "tropesToAvoid": [],
        "scoringWeights": {"interest": 12, "trope": 18, "source": 8, "avoidPenalty": 24},
    }
    fetched = {
        "url": "https://www.boletinoficial.gob.ar/",
        "ok": True,
        "warnings": [],
        "contentType": "text/html",
        "html": """
          <html><head><title>BOLETIN OFICIAL REPUBLICA ARGENTINA</title></head>
          <body>
            BOLETIN OFICIAL REPUBLICA ARGENTINA Toggle navigation Boletín Oficial de la República Argentina
            Institucional Productos y servicios Preguntas Frecuentes Contacto &times;
            <img src="data:image/13;base64,/9j/4AAQSkZJRgABAQAA">
            datos auditables regulación operativa pymes argentinas
          </body></html>
        """,
    }

    assert editarra.build_candidate_from_fetch(agenda, "datos auditables pymes", fetched, "run-x") is None


def test_build_candidate_keeps_real_boletin_article_with_operational_signal():
    agenda = {
        "id": "agenda-umsa-diaria",
        "compatibleAuthors": ["Editor UMSA Diaria"],
        "compatibleRecipes": ["reactiva"],
        "compatibleOperationModes": ["modo-alerta-regulatoria"],
        "interests": ["datos auditables", "pymes argentinas", "regulación operativa"],
        "tropesToSeek": ["norma nueva que exige evidencia"],
        "tropesToAvoid": [],
        "scoringWeights": {"interest": 12, "trope": 18, "source": 8, "avoidPenalty": 24},
    }
    fetched = {
        "url": "https://www.boletinoficial.gob.ar/detalleAviso/primera/325100/20260615",
        "ok": True,
        "warnings": [],
        "contentType": "text/html",
        "html": """
          <html><head><title>Resolución sobre registros digitales auditables para operadores pyme</title></head>
          <body>
            La nueva regulación operativa exige registros con datos auditables para pymes argentinas.
            La medida incorpora evidencia documental, trazabilidad y requisitos de cumplimiento.
          </body></html>
        """,
    }

    candidate = editarra.build_candidate_from_fetch(agenda, "datos auditables pymes", fetched, "run-x")

    assert candidate is not None
    assert candidate["sourceName"] == "www.boletinoficial.gob.ar"
    assert "datos auditables" in candidate["matchedInterests"]


def test_build_candidate_from_llm_keeps_only_source_supported_interests_and_caps_score():
    agenda = {
        "id": "agenda-umsa-diaria",
        "compatibleAuthors": ["Editor UMSA Diaria"],
        "compatibleRecipes": ["reactiva"],
        "compatibleOperationModes": ["modo-alerta-regulatoria"],
        "interests": ["software libre aplicado", "datos auditables", "pymes argentinas"],
        "tropesToSeek": ["norma nueva que exige evidencia"],
        "tropesToAvoid": [],
        "scoringWeights": {"interest": 12, "trope": 18, "source": 8, "avoidPenalty": 24},
    }
    fetched = {
        "url": "https://opensource.org/blog/open-standards-requirement-for-software",
        "ok": True,
        "warnings": [],
        "contentType": "text/html",
        "html": """
          <html><head><title>Open Standards Requirement for Software &#8211; Open Source Initiative</title></head>
          <body>Open standards and open source software requirements improve compliance, auditability and governance.</body></html>
        """,
    }

    candidate = editarra.build_candidate_from_llm_item(
        agenda,
        "software libre aplicado datos auditables",
        {fetched["url"]: fetched},
        "run-x",
        {
            "sourceUrl": fetched["url"],
            "title": "Open Standards Requirement for Software &#8211; Open Source Initiative",
            "summary": "Open standards con evidencia.",
            "matchedInterests": ["software libre aplicado", "datos auditables", "pymes argentinas"],
            "score": 100,
        },
    )

    assert candidate is not None
    assert "software libre aplicado" in candidate["matchedInterests"]
    assert "datos auditables" in candidate["matchedInterests"]
    assert "pymes argentinas" not in candidate["matchedInterests"]
    assert candidate["score"] < 100
    assert "&#8211;" not in candidate["title"]


def test_build_candidate_from_llm_keeps_source_title_and_rejects_query_only_matches():
    agenda = {
        "id": "agenda-umsa-diaria",
        "compatibleAuthors": ["Editor UMSA Diaria"],
        "compatibleRecipes": ["reactiva"],
        "compatibleOperationModes": ["modo-alerta-regulatoria"],
        "interests": ["datos auditables", "software libre aplicado"],
        "tropesToSeek": ["norma nueva que exige evidencia"],
        "tropesToAvoid": [],
        "scoringWeights": {"interest": 12, "trope": 18, "source": 8, "avoidPenalty": 24},
    }
    fetched = {
        "url": "https://www.eff.org/deeplinks/2022/08/inside-fog-data-science-secretive-company-selling-mass-surveillance-local-police",
        "ok": True,
        "warnings": [],
        "contentType": "text/html",
        "html": """
          <html><head><title>Inside Fog Data Science, the Secretive Company Selling Mass Surveillance to Local Police | Electronic Frontier Foundation</title></head>
          <body>Fog Data Science sells mass surveillance location data to local police. The case raises compliance, audit and data governance risks.</body></html>
        """,
    }

    candidate = editarra.build_candidate_from_llm_item(
        agenda,
        "datos auditables evidencia operativa",
        {fetched["url"]: fetched},
        "run-x",
        {
            "sourceUrl": fetched["url"],
            "title": "Fog Data Science: vigilancia masiva a bajo costo para policías locales, ¿qué datos tuyos están en juego?",
            "summary": "Riesgo operativo por datos de vigilancia.",
            "matchedInterests": ["datos auditables"],
            "score": 100,
        },
    )

    assert candidate is not None
    assert candidate["title"].startswith("Inside Fog Data Science")
    assert "¿qué datos tuyos" not in candidate["title"]

    weak_fetch = {
        "url": "https://www.bcra.gob.ar/noticia/discurso-presidente/",
        "ok": True,
        "warnings": [],
        "contentType": "text/html",
        "html": "<html><head><title>Discurso del presidente del BCRA</title></head><body>Exposición de finanzas, economía e inversiones con comentarios macroeconómicos generales.</body></html>",
    }

    weak_candidate = editarra.build_candidate_from_llm_item(
        agenda,
        "evidencia software",
        {weak_fetch["url"]: weak_fetch},
        "run-x",
        {
            "sourceUrl": weak_fetch["url"],
            "title": "Discurso del presidente del BCRA",
            "summary": "Tema económico general.",
            "matchedInterests": [],
            "score": 85,
        },
    )

    assert weak_candidate is None


def test_interleave_ranked_links_balances_multiple_seed_sources():
    links = editarra.interleave_ranked_links([
        ["https://a.test/1", "https://a.test/2", "https://a.test/3"],
        ["https://b.test/1", "https://b.test/2"],
    ], ["https://seed.test"], 4)

    assert links == [
        "https://a.test/1",
        "https://b.test/1",
        "https://a.test/2",
        "https://b.test/2",
    ]


def test_parse_json_object_loose_accepts_fenced_json():
    parsed = editarra.parse_json_object_loose("""
    ```json
    {"candidates":[{"title":"Tema"}],"warnings":["ok"]}
    ```
    """)

    assert parsed["candidates"][0]["title"] == "Tema"


def test_parse_deepseek_candidates_payload_accepts_candidate_list():
    parsed = editarra.parse_deepseek_candidates_payload("""
    ```json
    [{"sourceUrl":"https://example.com/source","title":"Tema"}]
    ```
    """)

    assert parsed["candidates"][0]["title"] == "Tema"
    assert "normalizada" in parsed["warnings"][0]


def test_parse_deepseek_candidates_payload_accepts_prefaced_json():
    parsed = editarra.parse_deepseek_candidates_payload("""
    Resultado:
    {"candidates":[{"sourceUrl":"https://example.com/source","title":"Tema con contexto"}]}
    """)

    assert parsed["candidates"][0]["title"] == "Tema con contexto"


@pytest.mark.asyncio
async def test_discovery_uses_deepseek_when_configured(editarra_app, headers, monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-key")

    async def fake_fetch_url(session, url):
        return {
            "url": url,
            "ok": True,
            "warnings": [],
            "contentType": "text/html",
            "html": "<html><head><title>Open source observability</title></head><body>Nuevo release con evidencias operativas para pymes.</body></html>",
        }

    async def fake_generate_deepseek_candidates(agenda, query, fetched_results, run_id):
        return {
            "provider": "deepseek-web",
            "llmModel": "deepseek-v4-flash",
            "warnings": ["DeepSeek compacto activo."],
            "candidates": [{
                "id": "cand-deepseek-1",
                "runId": run_id,
                "agendaId": agenda["id"],
                "title": "Observabilidad abierta con evidencia operativa",
                "summary": "Tema priorizado por evidencia y aplicabilidad pyme.",
                "sourceName": "example.com",
                "sourceUrl": "https://example.com/source",
                "snippet": "Nuevo release con evidencia operativa.",
                "detectedTrope": "norma nueva",
                "matchedInterests": ["datos auditables"],
                "recommendedAuthor": "Editor UMSA Diaria",
                "recommendedRecipeId": "reactiva",
                "recommendedOperationModeId": "modo-alerta-regulatoria",
                "score": 84,
                "warnings": [],
                "status": "descubierto",
                "createdAt": editarra.utc_now_iso(),
                "updatedAt": editarra.utc_now_iso(),
            }],
        }

    monkeypatch.setattr(editarra, "fetch_url", fake_fetch_url)
    monkeypatch.setattr(editarra, "generate_deepseek_candidates", fake_generate_deepseek_candidates)
    transport = ASGITransport(app=editarra_app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/editarra/agendas", headers=headers, json={
            "id": "agenda-deepseek",
            "name": "Agenda DeepSeek",
            "destination": "editarra-studio",
            "compatibleAuthors": ["Editor UMSA Diaria"],
            "compatibleRecipes": ["reactiva"],
            "compatibleOperationModes": ["modo-alerta-regulatoria"],
            "interests": ["datos auditables"],
            "tropesToSeek": ["norma nueva"],
            "sourceUrls": ["https://example.com/source"],
        })
        discovery = await client.post("/api/editarra/discovery/run", headers=headers, json={
            "agendaId": "agenda-deepseek",
            "query": "observabilidad",
        })

    assert discovery.status_code == 200
    payload = discovery.json()
    assert payload["run"]["provider"] == "deepseek-web"
    assert payload["run"]["llmModel"] == "deepseek-v4-flash"
    assert payload["candidates"][0]["title"] == "Observabilidad abierta con evidencia operativa"


def test_build_candidate_from_llm_item_accepts_compatible_aliases():
    agenda = {
        "id": "agenda-x",
        "compatibleAuthors": ["Editor UMSA Diaria"],
        "compatibleRecipes": ["reactiva"],
        "compatibleOperationModes": ["modo-alerta-regulatoria"],
        "interests": ["datos auditables"],
        "tropesToSeek": ["norma nueva"],
        "tropesToAvoid": [],
    }
    fetched = {
        "url": "https://example.com/source",
        "ok": True,
        "warnings": [],
        "contentType": "text/html",
        "html": "<html><head><title>PostgreSQL 19 Beta 1 Released!</title></head><body>PostgreSQL para pymes con datos auditables y norma nueva.</body></html>",
    }

    candidate = editarra.build_candidate_from_llm_item(
        agenda,
        "postgresql pymes",
        {"https://example.com/source": fetched},
        "run-x",
        {
            "sourceUrl": "https://example.com/source",
            "title": "PostgreSQL 19 Beta 1 Released!",
            "matchReason": "Tema aplicable a pymes con datos auditables.",
            "trope": "norma nueva",
            "compatibleAuthor": "Editor UMSA Diaria",
            "compatibleRecipe": "reactiva",
            "compatibleMode": "modo-alerta-regulatoria",
            "score": 77,
        },
    )

    assert candidate is not None
    assert candidate["recommendedRecipeId"] == "reactiva"
    assert candidate["recommendedOperationModeId"] == "modo-alerta-regulatoria"
    assert candidate["summary"] == "Tema aplicable a pymes con datos auditables."
