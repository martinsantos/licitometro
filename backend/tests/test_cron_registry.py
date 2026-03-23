"""Tests for the declarative cron job registry."""

import pytest
from unittest.mock import MagicMock, patch

apscheduler = pytest.importorskip("apscheduler", reason="apscheduler not installed (CI-light env)")

from services.cron_registry import CRON_JOBS, register_all_crons


class TestCronJobDefinitions:
    def test_expected_job_count(self):
        """Registry should have 9 cron jobs defined."""
        assert len(CRON_JOBS) == 9

    def test_all_jobs_have_required_fields(self):
        required = {"id", "name", "trigger", "service_module", "service_factory", "method"}
        for job in CRON_JOBS:
            missing = required - set(job.keys())
            assert not missing, f"Job '{job.get('id', '?')}' missing fields: {missing}"

    def test_unique_ids(self):
        ids = [j["id"] for j in CRON_JOBS]
        assert len(ids) == len(set(ids)), f"Duplicate IDs: {[x for x in ids if ids.count(x) > 1]}"

    def test_expected_ids_present(self):
        ids = {j["id"] for j in CRON_JOBS}
        expected = {
            "storage_cleanup", "auto_update_active", "enrichment_cron",
            "daily_digest", "nodo_digest_morning", "nodo_digest_evening",
            "daily_estado_update", "embedding_batch", "deadline_alerts",
        }
        assert ids == expected

    def test_nodo_digest_morning_has_args(self):
        """Morning digest should pass both 'daily' and 'twice_daily' frequencies."""
        job = next(j for j in CRON_JOBS if j["id"] == "nodo_digest_morning")
        assert "args" in job
        assert ["daily", "twice_daily"] in job["args"]

    def test_nodo_digest_evening_has_args(self):
        """Evening digest should pass only 'twice_daily' frequency."""
        job = next(j for j in CRON_JOBS if j["id"] == "nodo_digest_evening")
        assert "args" in job
        assert ["twice_daily"] in job["args"]


class TestRegisterAllCrons:
    def test_registers_all_jobs(self):
        """register_all_crons should call scheduler.add_job for each entry."""
        scheduler = MagicMock()
        db = MagicMock()

        # Patch importlib to return mock modules with mock factories
        with patch("importlib.import_module") as mock_import:
            mock_service = MagicMock()
            mock_module = MagicMock()
            # Make any factory return the mock service
            mock_module.configure_mock(**{
                name: MagicMock(return_value=mock_service)
                for name in set(j["service_factory"] for j in CRON_JOBS)
            })
            # getattr on mock_module returns MagicMock by default, which is callable
            mock_import.return_value = mock_module

            register_all_crons(scheduler, db)

            assert scheduler.add_job.call_count == len(CRON_JOBS)

    def test_failed_job_doesnt_block_others(self):
        """A failing job should not prevent other jobs from registering."""
        scheduler = MagicMock()
        db = MagicMock()
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise Exception("First job fails")

        with patch("importlib.import_module") as mock_import:
            mock_module = MagicMock()
            mock_import.return_value = mock_module
            # Make the first add_job call fail
            scheduler.add_job.side_effect = side_effect

            register_all_crons(scheduler, db)

            # Should have tried all jobs even though first failed
            assert scheduler.add_job.call_count == len(CRON_JOBS)
