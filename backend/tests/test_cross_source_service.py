from copy import deepcopy
from datetime import datetime
from pathlib import Path
import sys

import pytest
from bson import ObjectId

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.cross_source_service import CrossSourceService


class _FakeCollection:
    def __init__(self, docs):
        self.docs = {doc["_id"]: deepcopy(doc) for doc in docs}

    async def find_one(self, query, projection=None):
        doc = self.docs.get(query.get("_id"))
        return deepcopy(doc) if doc else None

    async def update_one(self, query, update):
        doc = self.docs[query["_id"]]
        for key, value in update.get("$set", {}).items():
            doc[key] = value


class _FakeDb:
    def __init__(self, docs):
        self.licitaciones = _FakeCollection(docs)


@pytest.mark.asyncio
async def test_merge_source_data_does_not_copy_opening_date_before_publication_date():
    base_id = ObjectId()
    related_id = ObjectId()
    db = _FakeDb(
        [
            {
                "_id": base_id,
                "title": "Base",
                "organization": "ATM",
                "publication_date": datetime(2026, 5, 19),
                "opening_date": None,
                "fuente": "Boletin Oficial Mendoza (PDF)",
                "metadata": {},
            },
            {
                "_id": related_id,
                "title": "Related",
                "organization": "ATM",
                "publication_date": datetime(2026, 5, 14),
                "opening_date": datetime(2026, 5, 14),
                "fuente": "boletin_oficial_nacional",
            },
        ]
    )

    merged = await CrossSourceService(db).merge_source_data(str(base_id), str(related_id))

    assert merged["opening_date"] is None
    assert "opening_date" not in merged["metadata"]["cross_source_merges"][-1]["fields_merged"]
