from datetime import datetime
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.repair_invalid_opening_dates import build_repair_update


def test_build_repair_update_unsets_opening_date_and_preserves_previous_value():
    doc = {
        "publication_date": datetime(2026, 5, 19),
        "opening_date": datetime(2026, 5, 14),
    }

    update = build_repair_update(doc)

    assert update["$set"]["opening_date"] is None
    assert update["$push"]["metadata.date_repairs"]["field"] == "opening_date"
    assert update["$push"]["metadata.date_repairs"]["old_value"] == datetime(2026, 5, 14)


def test_build_repair_update_returns_none_for_valid_dates():
    doc = {
        "publication_date": datetime(2026, 5, 19),
        "opening_date": datetime(2026, 6, 1),
    }

    assert build_repair_update(doc) is None
