"""
Scraper Health Service - Monitors and scores scraper health.

Computes health scores per scraper based on recent run history.
Provides auto-pause for consistently failing scrapers and alerts.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("scraper_health")


class ScraperHealthService:
    """Monitors scraper health and provides scoring/alerting."""

    # Thresholds
    HEALTHY_THRESHOLD = 80       # score >= 80 → green
    WARNING_THRESHOLD = 50       # 50 <= score < 80 → yellow
    # score < 50 → red

    ALERT_CONSECUTIVE_FAILURES = 3  # alert (not pause) after N failures
    LOOKBACK_RUNS = 20  # analyze last N runs for health score

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def get_health_report(self) -> List[Dict[str, Any]]:
        """Get health report for all scrapers."""
        configs = await self.db.scraper_configs.find().to_list(length=200)
        report = []

        for config in configs:
            name = config.get("name", "unknown")
            score_data = await self._compute_health_score(name)
            score_data["name"] = name
            score_data["active"] = config.get("active", False)
            score_data["schedule"] = config.get("schedule", "")
            score_data["url"] = str(config.get("url", ""))
            score_data["last_run"] = config.get("last_run")
            score_data["runs_count"] = config.get("runs_count", 0)
            report.append(score_data)

        # Sort by score ascending (worst first)
        report.sort(key=lambda x: x.get("score", 0))
        return report

    async def _compute_health_score(self, scraper_name: str) -> Dict[str, Any]:
        """
        Compute health score (0-100) for a scraper.

        Components (weighted):
        - success_rate (40%): % of successful runs in last N
        - freshness (30%): time since last successful run
        - yield_rate (20%): avg items found per run
        - stability (10%): no consecutive failures
        """
        runs = await self.db.scraper_runs.find(
            {"scraper_name": scraper_name}
        ).sort("started_at", -1).limit(self.LOOKBACK_RUNS).to_list(length=self.LOOKBACK_RUNS)

        if not runs:
            return {
                "score": 0,
                "status": "unknown",
                "success_rate": 0,
                "freshness_hours": None,
                "avg_items_found": 0,
                "avg_duration": 0,
                "consecutive_failures": 0,
                "total_runs_analyzed": 0,
                "last_success": None,
                "should_pause": False,
                "issues": ["No run history"],
            }

        # 1. Success rate (40 points max)
        successful = sum(1 for r in runs if r.get("status") == "success")
        total = len(runs)
        success_rate = successful / total if total > 0 else 0
        success_score = success_rate * 40

        # 2. Freshness (30 points max)
        last_success = None
        for r in runs:
            if r.get("status") == "success":
                last_success = r.get("started_at")
                break

        freshness_hours = None
        freshness_score = 0
        if last_success:
            freshness_hours = (datetime.utcnow() - last_success).total_seconds() / 3600
            if freshness_hours < 12:
                freshness_score = 30
            elif freshness_hours < 24:
                freshness_score = 25
            elif freshness_hours < 48:
                freshness_score = 15
            elif freshness_hours < 168:  # 7 days
                freshness_score = 5
            else:
                freshness_score = 0

        # 3. Yield rate (20 points max)
        items_found_list = [r.get("items_found", 0) for r in runs if r.get("status") == "success"]
        avg_items = sum(items_found_list) / len(items_found_list) if items_found_list else 0
        if avg_items >= 10:
            yield_score = 20
        elif avg_items >= 5:
            yield_score = 15
        elif avg_items >= 1:
            yield_score = 10
        else:
            yield_score = 0

        # 4. Stability (10 points max) — no consecutive failures
        consecutive_failures = 0
        for r in runs:
            if r.get("status") in ("failed", "partial"):
                consecutive_failures += 1
            else:
                break

        if consecutive_failures == 0:
            stability_score = 10
        elif consecutive_failures == 1:
            stability_score = 7
        elif consecutive_failures == 2:
            stability_score = 3
        else:
            stability_score = 0

        score = int(success_score + freshness_score + yield_score + stability_score)

        # Determine status
        if score >= self.HEALTHY_THRESHOLD:
            status = "healthy"
        elif score >= self.WARNING_THRESHOLD:
            status = "warning"
        else:
            status = "critical"

        # Flag for alerting (report only, no auto-pause)
        needs_attention = consecutive_failures >= self.ALERT_CONSECUTIVE_FAILURES

        # Collect issues
        issues = []
        if success_rate < 0.5:
            issues.append(f"Low success rate: {success_rate:.0%}")
        if consecutive_failures >= 3:
            issues.append(f"{consecutive_failures} consecutive failures")
        if freshness_hours and freshness_hours > 48:
            issues.append(f"No successful run in {freshness_hours:.0f}h")
        if avg_items == 0 and successful > 0:
            issues.append("Runs succeed but find 0 items")

        # Avg duration
        durations = [r.get("duration_seconds", 0) for r in runs if r.get("duration_seconds")]
        avg_duration = sum(durations) / len(durations) if durations else 0

        return {
            "score": min(score, 100),
            "status": status,
            "success_rate": round(success_rate, 2),
            "freshness_hours": round(freshness_hours, 1) if freshness_hours is not None else None,
            "avg_items_found": round(avg_items, 1),
            "avg_duration": round(avg_duration, 1),
            "consecutive_failures": consecutive_failures,
            "total_runs_analyzed": total,
            "last_success": last_success.isoformat() if last_success else None,
            "needs_attention": needs_attention,
            "issues": issues,
        }

    async def check_and_alert_failing(self) -> List[Dict[str, Any]]:
        """
        Check all active scrapers and return those needing attention (3+ consecutive failures).
        Does NOT pause anything — only reports.
        """
        configs = await self.db.scraper_configs.find({"active": True}).to_list(length=200)
        failing = []

        for config in configs:
            name = config.get("name", "unknown")
            health = await self._compute_health_score(name)

            if health["needs_attention"]:
                failing.append({
                    "name": name,
                    "consecutive_failures": health["consecutive_failures"],
                    "score": health["score"],
                    "issues": health["issues"],
                })
                logger.warning(
                    f"Scraper '{name}' needs attention: "
                    f"{health['consecutive_failures']} consecutive failures, score={health['score']}"
                )

        return failing


# Singleton
_health_service: Optional[ScraperHealthService] = None


def get_scraper_health_service(db: AsyncIOMotorDatabase) -> ScraperHealthService:
    global _health_service
    if _health_service is None:
        _health_service = ScraperHealthService(db)
    return _health_service
