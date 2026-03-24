"""
Unit tests for backend/utils/filter_builder.py.

Pure unit tests — no database dependency.
Tests verify the MongoDB filter dict output of build_base_filters()
and build_cross_match().
"""
import re
from datetime import date, datetime

import pytest

from utils.filter_builder import (
    ALLOWED_DATE_FIELDS,
    build_base_filters,
    build_cross_match,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _regex_matches(pattern_dict: dict, value: str) -> bool:
    """Check that a {'$regex': ..., '$options': 'i'} dict matches the given value."""
    flags = re.IGNORECASE if pattern_dict.get("$options") == "i" else 0
    return bool(re.match(pattern_dict["$regex"], value, flags))


# ===========================================================================
# 1. Default filters (no params)
# ===========================================================================

class TestDefaultFilters:
    def test_excludes_vencida_and_archivada(self):
        f = build_base_filters()
        assert f["estado"] == {"$nin": ["vencida", "archivada"]}

    def test_excludes_lic_ar(self):
        f = build_base_filters()
        assert f["tags"] == {"$ne": "LIC_AR"}

    def test_no_extra_keys(self):
        f = build_base_filters()
        # Only these two keys should be present when no params are passed
        assert set(f.keys()) == {"tags", "estado"}

    def test_no_text_search(self):
        f = build_base_filters()
        assert "$text" not in f

    def test_no_budget(self):
        f = build_base_filters()
        assert "budget" not in f

    def test_no_date_range(self):
        f = build_base_filters()
        assert "publication_date" not in f
        assert "opening_date" not in f


# ===========================================================================
# 2. Estado filter
# ===========================================================================

class TestEstadoFilter:
    def test_single_value(self):
        f = build_base_filters(estado="vigente")
        assert f["estado"] == "vigente"

    def test_comma_separated_values(self):
        f = build_base_filters(estado="vigente,prorrogada")
        assert f["estado"] == {"$in": ["vigente", "prorrogada"]}

    def test_comma_separated_strips_whitespace(self):
        f = build_base_filters(estado="vigente, prorrogada , vencida")
        assert f["estado"] == {"$in": ["vigente", "prorrogada", "vencida"]}

    def test_default_excludes_vencida_and_archivada(self):
        f = build_base_filters()
        assert f["estado"] == {"$nin": ["vencida", "archivada"]}

    def test_explicit_archivada_is_allowed(self):
        f = build_base_filters(estado="archivada")
        assert f["estado"] == "archivada"

    def test_all_estados_comma_separated(self):
        f = build_base_filters(estado="vigente,vencida,archivada")
        assert set(f["estado"]["$in"]) == {"vigente", "vencida", "archivada"}


# ===========================================================================
# 3. Fuente filter — case-insensitive regex
# ===========================================================================

class TestFuenteFilter:
    def test_fuente_becomes_regex(self):
        f = build_base_filters(fuente="OSEP")
        assert "$regex" in f["fuente"]
        assert "$options" in f["fuente"]
        assert f["fuente"]["$options"] == "i"

    def test_fuente_regex_anchored(self):
        f = build_base_filters(fuente="OSEP")
        pattern = f["fuente"]["$regex"]
        assert pattern.startswith("^")
        assert pattern.endswith("$")

    def test_fuente_case_insensitive_match(self):
        f = build_base_filters(fuente="Boletin Oficial")
        assert _regex_matches(f["fuente"], "boletin oficial")
        assert _regex_matches(f["fuente"], "BOLETIN OFICIAL")
        assert _regex_matches(f["fuente"], "Boletin Oficial")

    def test_fuente_does_not_match_partial(self):
        f = build_base_filters(fuente="OSEP")
        assert not _regex_matches(f["fuente"], "OSEP extra")
        assert not _regex_matches(f["fuente"], "prefix OSEP")

    def test_fuente_escapes_special_chars(self):
        # A fuente with regex special chars should be treated literally
        f = build_base_filters(fuente="COMPR.AR (Mendoza)")
        assert _regex_matches(f["fuente"], "COMPR.AR (Mendoza)")
        # The dot should NOT match any character
        assert not _regex_matches(f["fuente"], "COMPRXAR (Mendoza)")

    def test_organization_becomes_regex(self):
        f = build_base_filters(organization="Municipalidad de Mendoza")
        assert "$regex" in f["organization"]
        assert f["organization"]["$options"] == "i"
        assert _regex_matches(f["organization"], "municipalidad de mendoza")


# ===========================================================================
# 4. fuente_exclude alone
# ===========================================================================

class TestFuenteExclude:
    def test_fuente_exclude_alone_uses_nin(self):
        f = build_base_filters(fuente_exclude=["ComprasApps", "OSEP"])
        assert f["fuente"] == {"$nin": ["ComprasApps", "OSEP"]}

    def test_fuente_exclude_single_item(self):
        f = build_base_filters(fuente_exclude=["EMESA"])
        assert f["fuente"] == {"$nin": ["EMESA"]}

    def test_fuente_exclude_alone_no_and(self):
        f = build_base_filters(fuente_exclude=["OSEP"])
        assert "$and" not in f


# ===========================================================================
# 5. fuente + fuente_exclude — fuente as regex, exclude via $and
# ===========================================================================

class TestFuentePlusFuenteExclude:
    def test_fuente_stays_as_regex_when_exclude_present(self):
        f = build_base_filters(fuente="COMPR.AR", fuente_exclude=["EMESA"])
        assert "$regex" in f["fuente"]

    def test_exclude_goes_into_and_when_fuente_present(self):
        f = build_base_filters(fuente="COMPR.AR", fuente_exclude=["EMESA"])
        assert "$and" in f
        and_clauses = f["$and"]
        nin_clauses = [c for c in and_clauses if "fuente" in c and "$nin" in c["fuente"]]
        assert len(nin_clauses) == 1
        assert "EMESA" in nin_clauses[0]["fuente"]["$nin"]

    def test_fuente_regex_not_overwritten(self):
        f = build_base_filters(fuente="OSEP", fuente_exclude=["EMESA"])
        # Top-level fuente is still the regex (not overwritten by $nin)
        assert "$regex" in f["fuente"]
        assert "$nin" not in f["fuente"]

    def test_multiple_excludes_in_and(self):
        f = build_base_filters(fuente="COMPR.AR", fuente_exclude=["EMESA", "AYSAM"])
        and_clauses = f["$and"]
        nin_values = and_clauses[0]["fuente"]["$nin"]
        assert set(nin_values) == {"EMESA", "AYSAM"}


# ===========================================================================
# 6. Budget range
# ===========================================================================

class TestBudgetRange:
    def test_budget_min_only(self):
        f = build_base_filters(budget_min=100_000.0)
        assert f["budget"] == {"$gte": 100_000.0}

    def test_budget_max_only(self):
        f = build_base_filters(budget_max=500_000.0)
        assert f["budget"] == {"$lte": 500_000.0}

    def test_budget_min_and_max(self):
        f = build_base_filters(budget_min=50_000.0, budget_max=1_000_000.0)
        assert f["budget"] == {"$gte": 50_000.0, "$lte": 1_000_000.0}

    def test_budget_zero_min_included(self):
        # budget_min=0.0 is falsy in Python but is not None — should be applied
        f = build_base_filters(budget_min=0.0)
        assert "$gte" in f["budget"]
        assert f["budget"]["$gte"] == 0.0

    def test_no_budget_filter_when_neither_set(self):
        f = build_base_filters()
        assert "budget" not in f


# ===========================================================================
# 7. Date range — fecha_desde, fecha_hasta, custom fecha_campo
# ===========================================================================

class TestDateRange:
    def test_fecha_desde_sets_gte(self):
        d = date(2026, 1, 1)
        f = build_base_filters(fecha_desde=d)
        assert f["publication_date"]["$gte"] == datetime(2026, 1, 1, 0, 0, 0)

    def test_fecha_hasta_sets_lte(self):
        d = date(2026, 12, 31)
        f = build_base_filters(fecha_hasta=d)
        assert f["publication_date"]["$lte"] == datetime(2026, 12, 31, 23, 59, 59, 999999)

    def test_fecha_desde_and_hasta(self):
        f = build_base_filters(fecha_desde=date(2026, 1, 1), fecha_hasta=date(2026, 6, 30))
        pub = f["publication_date"]
        assert "$gte" in pub
        assert "$lte" in pub

    def test_custom_fecha_campo_opening_date(self):
        f = build_base_filters(fecha_desde=date(2026, 3, 1), fecha_campo="opening_date")
        assert "opening_date" in f
        assert "publication_date" not in f

    def test_custom_fecha_campo_fecha_scraping(self):
        f = build_base_filters(fecha_hasta=date(2026, 3, 31), fecha_campo="fecha_scraping")
        assert "fecha_scraping" in f

    def test_invalid_fecha_campo_falls_back_to_publication_date(self):
        f = build_base_filters(fecha_desde=date(2026, 1, 1), fecha_campo="unknown_field")
        assert "publication_date" in f
        assert "unknown_field" not in f

    def test_all_allowed_date_fields_accepted(self):
        for campo in ALLOWED_DATE_FIELDS:
            f = build_base_filters(fecha_desde=date(2026, 1, 1), fecha_campo=campo)
            assert campo in f, f"Expected campo '{campo}' in filters"

    def test_no_date_range_keys_when_no_dates(self):
        f = build_base_filters()
        for campo in ALLOWED_DATE_FIELDS:
            assert campo not in f


# ===========================================================================
# 8. Year filter — basic, combined with date range (intersection)
# ===========================================================================

class TestYearFilter:
    def test_year_sets_publication_date_range(self):
        f = build_base_filters(year="2026")
        assert f["publication_date"]["$gte"] == datetime(2026, 1, 1)
        assert f["publication_date"]["$lte"] == datetime(2026, 12, 31, 23, 59, 59)

    def test_year_all_is_ignored(self):
        f = build_base_filters(year="all")
        assert "publication_date" not in f

    def test_year_invalid_string_is_ignored(self):
        f = build_base_filters(year="notayear")
        assert "publication_date" not in f

    def test_year_combined_with_date_range_intersects(self):
        # fecha_desde narrows the year window from inside
        f = build_base_filters(
            fecha_desde=date(2026, 6, 1),
            fecha_hasta=date(2026, 8, 31),
            year="2026",
        )
        pub = f["publication_date"]
        # Lower bound: max(year_start=2026-01-01, fecha_desde=2026-06-01) → 2026-06-01
        assert pub["$gte"] == datetime(2026, 6, 1, 0, 0, 0)
        # Upper bound: min(year_end=2026-12-31, fecha_hasta=2026-08-31) → 2026-08-31
        assert pub["$lte"] == datetime(2026, 8, 31, 23, 59, 59, 999999)

    def test_year_combined_date_range_wider_than_year(self):
        # fecha_desde is before year start → year wins as lower bound
        f = build_base_filters(
            fecha_desde=date(2025, 1, 1),
            fecha_hasta=date(2027, 12, 31),
            year="2026",
        )
        pub = f["publication_date"]
        assert pub["$gte"] == datetime(2026, 1, 1)
        assert pub["$lte"] == datetime(2026, 12, 31, 23, 59, 59)

    def test_year_combined_date_range_on_non_publication_campo(self):
        # year always targets publication_date; fecha_campo targets opening_date
        f = build_base_filters(
            fecha_desde=date(2026, 3, 1),
            fecha_campo="opening_date",
            year="2026",
        )
        assert "opening_date" in f
        assert "publication_date" in f
        assert f["publication_date"]["$gte"] == datetime(2026, 1, 1)


# ===========================================================================
# 9. nuevas_desde — sets first_seen_at filter
# ===========================================================================

class TestNuevasDesdeFiler:
    def test_nuevas_desde_sets_first_seen_at(self):
        d = date(2026, 3, 20)
        f = build_base_filters(nuevas_desde=d)
        assert f["first_seen_at"] == {"$gte": datetime(2026, 3, 20, 0, 0, 0)}

    def test_nuevas_desde_not_set_when_none(self):
        f = build_base_filters()
        assert "first_seen_at" not in f

    def test_nuevas_desde_coexists_with_date_range(self):
        f = build_base_filters(
            fecha_desde=date(2026, 3, 20),
            fecha_campo="fecha_scraping",
            nuevas_desde=date(2026, 3, 20),
        )
        assert "first_seen_at" in f
        assert "fecha_scraping" in f


# ===========================================================================
# 10. Text search — sets $text filter
# ===========================================================================

class TestTextSearch:
    def test_q_sets_text_search(self):
        f = build_base_filters(q="pliego licitacion")
        assert f["$text"] == {"$search": "pliego licitacion"}

    def test_no_text_search_without_q(self):
        f = build_base_filters()
        assert "$text" not in f

    def test_q_suppresses_auto_future_opening(self):
        # When q is set, auto_future_opening should have no effect
        f = build_base_filters(q="computadoras", auto_future_opening=True)
        and_clauses = f.get("$and", [])
        future_opening_clauses = [
            c for c in and_clauses
            if "$or" in c
        ]
        assert len(future_opening_clauses) == 0


# ===========================================================================
# 11. auto_future_opening — adds $or for future dates
# ===========================================================================

class TestAutoFutureOpening:
    def test_auto_future_opening_adds_and_clause(self):
        f = build_base_filters(auto_future_opening=True)
        assert "$and" in f
        and_clauses = f["$and"]
        or_clauses = [c for c in and_clauses if "$or" in c]
        assert len(or_clauses) == 1

    def test_auto_future_opening_or_includes_none(self):
        f = build_base_filters(auto_future_opening=True)
        or_clause = next(c["$or"] for c in f["$and"] if "$or" in c)
        none_branches = [b for b in or_clause if b.get("opening_date") is None]
        assert len(none_branches) == 1

    def test_auto_future_opening_or_includes_gte_today(self):
        f = build_base_filters(auto_future_opening=True)
        or_clause = next(c["$or"] for c in f["$and"] if "$or" in c)
        gte_branches = [
            b for b in or_clause
            if isinstance(b.get("opening_date"), dict) and "$gte" in b["opening_date"]
        ]
        assert len(gte_branches) == 1
        # The $gte value should be today at midnight
        gte_dt = gte_branches[0]["opening_date"]["$gte"]
        today = date.today()
        assert gte_dt.date() == today
        assert gte_dt.hour == 0 and gte_dt.minute == 0

    def test_auto_future_opening_disabled_by_default(self):
        f = build_base_filters()
        and_clauses = f.get("$and", [])
        or_clauses = [c for c in and_clauses if "$or" in c]
        assert len(or_clauses) == 0

    def test_auto_future_opening_suppressed_by_q(self):
        f = build_base_filters(auto_future_opening=True, q="some query")
        and_clauses = f.get("$and", [])
        or_clauses = [c for c in and_clauses if "$or" in c]
        assert len(or_clauses) == 0

    def test_auto_future_opening_suppressed_when_fecha_desde_in_future(self):
        # fecha_desde >= today means user explicitly picked a future window;
        # auto_future_opening should NOT add its $or clause
        future_date = date(date.today().year + 1, 1, 1)
        f = build_base_filters(auto_future_opening=True, fecha_desde=future_date)
        and_clauses = f.get("$and", [])
        or_clauses = [c for c in and_clauses if "$or" in c]
        assert len(or_clauses) == 0


# ===========================================================================
# 12. only_national — sets tags to LIC_AR
# ===========================================================================

class TestOnlyNational:
    def test_only_national_true_sets_lic_ar(self):
        f = build_base_filters(only_national=True)
        assert f["tags"] == "LIC_AR"

    def test_only_national_false_excludes_lic_ar(self):
        f = build_base_filters(only_national=False)
        assert f["tags"] == {"$ne": "LIC_AR"}

    def test_default_is_not_national(self):
        f = build_base_filters()
        assert f["tags"] == {"$ne": "LIC_AR"}


# ===========================================================================
# 13. Nodo filter
# ===========================================================================

class TestNodoFilter:
    def test_nodo_sets_nodos_field(self):
        f = build_base_filters(nodo="abc123")
        assert f["nodos"] == "abc123"

    def test_no_nodo_filter_when_none(self):
        f = build_base_filters()
        assert "nodos" not in f

    def test_nodo_coexists_with_other_filters(self):
        f = build_base_filters(nodo="xyz", fuente="OSEP", estado="vigente")
        assert f["nodos"] == "xyz"
        assert "$regex" in f["fuente"]
        assert f["estado"] == "vigente"


# ===========================================================================
# 14. Misc field filters
# ===========================================================================

class TestMiscFilters:
    def test_status_filter(self):
        f = build_base_filters(status="publicada")
        assert f["status"] == "publicada"

    def test_category_filter(self):
        f = build_base_filters(category="Tecnología e Informática")
        assert f["category"] == "Tecnología e Informática"

    def test_workflow_state_filter(self):
        f = build_base_filters(workflow_state="evaluando")
        assert f["workflow_state"] == "evaluando"

    def test_jurisdiccion_filter(self):
        f = build_base_filters(jurisdiccion="Mendoza")
        assert f["jurisdiccion"] == "Mendoza"

    def test_tipo_procedimiento_filter(self):
        f = build_base_filters(tipo_procedimiento="licitacion_publica")
        assert f["tipo_procedimiento"] == "licitacion_publica"

    def test_location_filter(self):
        f = build_base_filters(location="San Rafael")
        assert f["location"] == "San Rafael"


# ===========================================================================
# 15. build_cross_match
# ===========================================================================

class TestBuildCrossMatch:
    def _base(self) -> dict:
        return build_base_filters(
            fuente="OSEP",
            fuente_exclude=["EMESA"],
            estado="vigente",
            budget_min=10_000.0,
        )

    def test_removes_top_level_excluded_field(self):
        base = self._base()
        cross = build_cross_match(base, "fuente")
        assert "fuente" not in cross

    def test_keeps_other_fields(self):
        base = self._base()
        cross = build_cross_match(base, "fuente")
        assert "estado" in cross
        assert "budget" in cross
        assert "tags" in cross

    def test_removes_and_entries_for_excluded_field(self):
        base = self._base()
        # $and should contain the fuente $nin from fuente_exclude
        assert "$and" in base
        cross = build_cross_match(base, "fuente")
        if "$and" in cross:
            for cond in cross["$and"]:
                assert "fuente" not in cond

    def test_deletes_empty_and(self):
        # Build a filter where the only $and entry references fuente
        base = build_base_filters(fuente="OSEP", fuente_exclude=["EMESA"])
        # $and should exist (fuente_exclude put it there)
        assert "$and" in base
        cross = build_cross_match(base, "fuente")
        # After removing fuente from $and, $and should be empty and deleted
        assert "$and" not in cross

    def test_preserves_and_entries_for_other_fields(self):
        # auto_future_opening adds a $and/$or for opening_date
        base = build_base_filters(
            fuente="OSEP",
            fuente_exclude=["EMESA"],
            auto_future_opening=True,
        )
        assert "$and" in base
        cross = build_cross_match(base, "fuente")
        # The opening_date $or clause should still be in $and
        assert "$and" in cross
        or_clauses = [c for c in cross["$and"] if "$or" in c]
        assert len(or_clauses) == 1

    def test_cross_match_on_estado(self):
        base = build_base_filters(estado="vigente", fuente="OSEP")
        cross = build_cross_match(base, "estado")
        assert "estado" not in cross
        assert "fuente" in cross

    def test_cross_match_on_budget(self):
        base = build_base_filters(budget_min=5000.0, budget_max=100_000.0, estado="vigente")
        cross = build_cross_match(base, "budget")
        assert "budget" not in cross
        assert "estado" in cross

    def test_cross_match_does_not_mutate_original(self):
        base = build_base_filters(fuente="OSEP", fuente_exclude=["EMESA"])
        original_keys = set(base.keys())
        build_cross_match(base, "fuente")
        assert set(base.keys()) == original_keys

    def test_cross_match_on_nonexistent_field_is_noop(self):
        base = build_base_filters(estado="vigente")
        cross = build_cross_match(base, "nonexistent_field")
        assert cross == base

    def test_cross_match_returns_new_dict(self):
        base = build_base_filters(estado="vigente")
        cross = build_cross_match(base, "tags")
        assert cross is not base
