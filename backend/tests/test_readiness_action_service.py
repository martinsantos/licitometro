import asyncio

from unittest.mock import patch

from services.readiness_action_service import ReadinessActionService


class _FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *_args):
        return self

    def limit(self, _limit):
        return self

    async def to_list(self, length):
        return self.docs[:length]


class _FakeSnapshots:
    def __init__(self, docs):
        self.docs = docs
        self.updated = None

    def find(self, filters):
        self.filters = filters
        return _FakeCursor(self.docs)

    async def update_many(self, filters, update):
        self.updated = {"filters": filters, "update": update}


class _FakeLicitaciones:
    def __init__(self, docs):
        self.docs = docs

    def find(self, _filters):
        return _FakeCursor(self.docs)


class _FakeBackfillRuns:
    def __init__(self, docs):
        self.docs = docs

    def find(self, *_args, **_kwargs):
        return _FakeCursor(self.docs)


class _FakeSettings:
    def __init__(self, doc=None):
        self.doc = doc
        self.updated = None

    async def find_one(self, _filters):
        return self.doc

    async def update_one(self, filters, update, upsert=False):
        self.updated = {"filters": filters, "update": update, "upsert": upsert}


class _FakeAlertEvents:
    def __init__(self):
        self.inserted = []

    async def insert_one(self, doc):
        self.inserted.append(doc)


class _FakeDB:
    def __init__(self, snapshots, licitaciones=None, backfill_runs=None, settings=None):
        self.offer_readiness_snapshots = _FakeSnapshots(snapshots)
        self.licitaciones = _FakeLicitaciones(licitaciones or [])
        self.source_backfill_runs = _FakeBackfillRuns(backfill_runs or [])
        self.operator_settings = _FakeSettings(settings)
        self.operator_alert_events = _FakeAlertEvents()


def test_overdue_digest_empty_when_no_docs():
    db = _FakeDB([])
    service = ReadinessActionService(db)

    result = asyncio.run(service.send_overdue_digest())

    assert result == {"processed": 0, "notifications_sent": 0}


def test_overdue_digest_builds_query():
    db = _FakeDB([])
    service = ReadinessActionService(db)

    asyncio.run(service.send_overdue_digest(limit=5))

    filters = db.offer_readiness_snapshots.filters
    assert filters["operator_action.resolved"] == {"$ne": True}
    assert "$lt" in filters["operator_action.due_date"]


def test_retry_analytics_groups_categories():
    db = _FakeDB([], backfill_runs=[
        {
            "retry": True,
            "processed": 2,
            "succeeded": 1,
            "failed": 1,
            "selected_items": [{"category": "rate_limit"}],
        },
        {
            "retry": True,
            "processed": 1,
            "succeeded": 1,
            "failed": 0,
            "selected_items": [{"category": "provider"}],
        },
    ])
    service = ReadinessActionService(db)

    result = asyncio.run(service._build_retry_analytics())

    assert result["totals"]["processed"] == 3
    assert result["totals"]["succeeded"] == 2
    assert result["totals"]["success_rate"] == 2 / 3
    categories = {item["category"]: item for item in result["by_category"]}
    assert categories["rate_limit"]["processed"] == 2
    assert categories["provider"]["processed"] == 1


def test_retry_digest_alerts_on_low_success_rate():
    db = _FakeDB([], backfill_runs=[
        {
            "retry": True,
            "processed": 4,
            "succeeded": 1,
            "failed": 3,
            "selected_items": [{"category": "provider"}],
        },
    ])
    service = ReadinessActionService(db)
    sent_messages = []

    async def fake_send(message):
        sent_messages.append(message)
        return True

    service._send_telegram = fake_send

    result = asyncio.run(service.send_backfill_retry_digest(min_success_rate=0.5))

    assert result["notifications_sent"] == 1
    assert "retries con bajo rendimiento" in sent_messages[0]
    assert db.operator_alert_events.inserted[0]["event_type"] == "ai_backfill_retry_digest"
    assert db.operator_alert_events.inserted[0]["delivered"] is True


def test_retry_alert_settings_can_disable_digest():
    db = _FakeDB([], backfill_runs=[
        {"retry": True, "processed": 4, "succeeded": 1, "failed": 3, "selected_items": [{"category": "provider"}]},
    ], settings={"value": {"disabled": True}})
    service = ReadinessActionService(db)

    result = asyncio.run(service.send_backfill_retry_digest())

    assert result == {"runs_evaluated": 0, "notifications_sent": 0, "reason": "disabled"}


def test_retry_alert_settings_are_clamped_and_persisted():
    db = _FakeDB([])
    service = ReadinessActionService(db)

    result = asyncio.run(service.update_retry_alert_settings({
        "min_success_rate": 2,
        "max_rate_limit_share": -1,
        "disabled": True,
    }))

    assert result["min_success_rate"] == 1
    assert result["max_rate_limit_share"] == 0
    assert result["disabled"] is True
    assert db.operator_settings.updated["upsert"] is True


def test_input_quality_repair_digest_sends_for_open_items():
    db = _FakeDB([])
    service = ReadinessActionService(db)
    sent_messages = []

    async def fake_send(message):
        sent_messages.append(message)
        return True

    class FakeAIService:
        async def build_input_quality_repair_queue(self, status="open", limit=100):
            return {
                "items": [
                    {
                        "id": "1",
                        "source_name": "COMPR.AR",
                        "title": "Obra",
                        "last_seen_at": "2020-01-01T00:00:00+00:00",
                    },
                    {
                        "id": "2",
                        "source_name": "Boletin",
                        "title": "Compra",
                        "last_seen_at": "2020-01-01T00:00:00+00:00",
                    },
                ]
            }

    service._send_telegram = fake_send
    with patch("services.ai_extraction_cron_service.get_ai_extraction_cron_service", return_value=FakeAIService()):
        result = asyncio.run(service.send_input_quality_repair_digest(min_open_items=2, max_age_hours=1))

    assert result["notifications_sent"] == 1
    assert result["open_items"] == 2
    assert "reparaciones input_quality" in sent_messages[0]
    assert db.operator_alert_events.inserted[0]["event_type"] == "input_quality_repair_digest"
