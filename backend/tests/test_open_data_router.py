from datetime import datetime
from pathlib import Path
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routers.open_data import _parse_date_param, _to_ocds


def test_to_ocds_handles_null_text_fields():
    release = _to_ocds({
        "_id": "abc123",
        "proceso_id": "PROC-1",
        "title": None,
        "objeto": None,
        "description": None,
        "organization": None,
        "estado": None,
        "fuente": None,
        "publication_date": datetime(2026, 5, 8),
        "opening_date": None,
    })

    assert release["ocid"] == "ocds-licitometro-PROC-1"
    assert release["parties"][0]["name"] == ""
    assert release["tender"]["title"] == ""
    assert release["tender"]["description"] == ""
    assert release["tender"]["status"] == "active"
    assert release["source"] == ""


def test_parse_date_param_rejects_invalid_iso_date():
    with pytest.raises(HTTPException) as exc:
        _parse_date_param("no-es-fecha", "fecha_desde")

    assert exc.value.status_code == 400
