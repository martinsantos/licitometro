"""
Scraper Health Monitor — runs after each scraping round and reports status.

Checks all scraper runs from the last round, detects failures, degraded
performance, and silent issues. Sends a summary via Telegram.

Also implements per-scraper circuit breaker:
- Closed: normal operation (failures < threshold)
- Open: refuses execution for cooldown_minutes (failures >= threshold)
- Half-open: after cooldown, allows 1 test execution
"""
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

logger = logging.getLogger("scraper_health_monitor")

# Circuit breaker defaults
DEFAULT_CIRCUIT_THRESHOLD = int(os.environ.get("CIRCUIT_BREAKER_THRESHOLD", "3"))
DEFAULT_CIRCUIT_COOLDOWN_MIN = int(os.environ.get("CIRCUIT_BREAKER_COOLDOWN_MIN", "30"))

# Critical scrapers that MUST succeed every round
CRITICAL_SCRAPERS = {
    "ComprasApps Mendoza",
    "COMPR.AR Mendoza",
    "Boletin Oficial Mendoza",
    "Maipu",
    "MPF Mendoza",
    "contrataciones_abiertas_mendoza_ocds",
}

# Minimum expected items per scraper (alert if below)
MIN_EXPECTED_ITEMS = {
    "ComprasApps Mendoza": 500,
    "COMPR.AR Mendoza": 30,
    "Maipu": 100,
    "MPF Mendoza": 50,
}


def _utcnow():
    return datetime.now(timezone.utc)


class ScraperHealthMonitor:
    def __init__(self, db):
        self.db = db

    # ── Circuit breaker ──────────────────────────────────────────────────

    async def is_circuit_open(self, scraper_name: str,
                              threshold: int = DEFAULT_CIRCUIT_THRESHOLD,
                              cooldown_minutes: int = DEFAULT_CIRCUIT_COOLDOWN_MIN) -> bool:
        """Check if the circuit breaker is OPEN for a scraper.

        Returns True if execution should be blocked (open or half-open pending).
        """
        doc = await self.db.scraper_configs.find_one(
            {"name": scraper_name},
            {"circuit_failures": 1, "circuit_open_since": 1, "circuit_half_open": 1},
        )
        if not doc:
            return False

        failures = doc.get("circuit_failures", 0)
        if failures < threshold:
            return False  # closed

        open_since = doc.get("circuit_open_since")
        if open_since and (_utcnow() - open_since) < timedelta(minutes=cooldown_minutes):
            return True  # open — still in cooldown

        # Cooldown expired — enter half-open (allow 1 attempt)
        if doc.get("circuit_half_open"):
            return True  # already had the test attempt, still failing
        return False  # half-open entry — allow test execution

    async def record_success(self, scraper_name: str):
        """Reset circuit breaker on successful execution."""
        await self.db.scraper_configs.update_one(
            {"name": scraper_name},
            {"$set": {"circuit_failures": 0},
             "$unset": {"circuit_open_since": "", "circuit_half_open": ""}},
        )

    async def record_failure(self, scraper_name: str,
                             threshold: int = DEFAULT_CIRCUIT_THRESHOLD):
        """Record a failure and open circuit breaker if threshold reached."""
        doc = await self.db.scraper_configs.find_one(
            {"name": scraper_name},
            {"circuit_failures": 1, "circuit_half_open": 1},
        )
        current = (doc or {}).get("circuit_failures", 0)
        was_half_open = (doc or {}).get("circuit_half_open", False)

        if was_half_open:
            # Test execution failed — re-open with fresh cooldown
            await self.db.scraper_configs.update_one(
                {"name": scraper_name},
                {"$set": {"circuit_failures": threshold, "circuit_open_since": _utcnow(),
                          "circuit_half_open": False}},
            )
            logger.warning(f"Circuit breaker RE-OPENED for {scraper_name} after half-open test failed")
        elif current >= threshold:
            # Already open — record but don't change state
            await self.db.scraper_configs.update_one(
                {"name": scraper_name},
                {"$inc": {"circuit_failures": 1}},
            )
        else:
            new_count = current + 1
            if new_count >= threshold:
                await self.db.scraper_configs.update_one(
                    {"name": scraper_name},
                    {"$set": {"circuit_failures": new_count, "circuit_open_since": _utcnow()}},
                )
                logger.warning(f"Circuit breaker OPENED for {scraper_name} after {new_count} consecutive failures")
            else:
                await self.db.scraper_configs.update_one(
                    {"name": scraper_name},
                    {"$inc": {"circuit_failures": 1}},
                )

    async def get_circuit_state(self, scraper_name: str) -> Dict[str, Any]:
        """Get current circuit breaker state for a scraper."""
        doc = await self.db.scraper_configs.find_one(
            {"name": scraper_name},
            {"circuit_failures": 1, "circuit_open_since": 1, "circuit_half_open": 1},
        )
        if not doc:
            return {"state": "unknown", "failures": 0}
        failures = doc.get("circuit_failures", 0)
        if failures < DEFAULT_CIRCUIT_THRESHOLD:
            return {"state": "closed", "failures": failures}
        open_since = doc.get("circuit_open_since")
        if open_since and (_utcnow() - open_since) < timedelta(minutes=DEFAULT_CIRCUIT_COOLDOWN_MIN):
            return {"state": "open", "failures": failures, "open_since": open_since.isoformat()}
        if doc.get("circuit_half_open"):
            return {"state": "open", "failures": failures, "note": "half-open test failed"}
        return {"state": "half_open", "failures": failures}

    async def get_health_report(self, days: int = 7) -> Dict[str, Any]:
        """Comprehensive health report: success rates, circuit breakers, items/day."""
        since = _utcnow() - timedelta(days=days)
        runs = await self.db.scraper_runs.find(
            {"started_at": {"$gte": since}}
        ).to_list(5000)

        per_scraper: Dict[str, dict] = {}
        for r in runs:
            name = r.get("scraper_name", "unknown")
            s = per_scraper.setdefault(name, {"success": 0, "failed": 0, "total_items": 0, "runs": 0})
            s["runs"] += 1
            status = r.get("status", "")
            if status == "success":
                s["success"] += 1
            elif status in ("failed", "error", "empty_suspicious"):
                s["failed"] += 1
            s["total_items"] += r.get("items_found", 0)

        # Add circuit breaker state
        configs = await self.db.scraper_configs.find(
            {"active": True},
            {"name": 1, "circuit_failures": 1},
        ).to_list(200)

        scraper_health = []
        for cfg in configs:
            name = cfg["name"]
            s = per_scraper.get(name, {"success": 0, "failed": 0, "total_items": 0, "runs": 0})
            total_runs = s["runs"]
            success_rate = round(s["success"] / total_runs * 100, 1) if total_runs > 0 else 0
            scraper_health.append({
                "name": name,
                "runs": total_runs,
                "success_rate": success_rate,
                "total_items": s["total_items"],
                "circuit_failures": cfg.get("circuit_failures", 0),
            })

        return {
            "period_days": days,
            "total_scrapers": len(scraper_health),
            "scrapers": sorted(scraper_health, key=lambda x: x["success_rate"]),
            "circuit_breakers_open": sum(
                1 for s in scraper_health
                if s["circuit_failures"] >= DEFAULT_CIRCUIT_THRESHOLD
            ),
        }

    async def run_health_check(self):
        """Run post-round health check and send Telegram report."""
        try:
            report = await self._build_report()
            if report:
                await self._send_telegram(report)
        except Exception as e:
            logger.error(f"Health check failed: {e}")

    async def _build_report(self) -> Optional[str]:
        """Analyze last round of scraper runs and build report."""
        # Get runs from last 2 hours (covers one scraping round)
        since = _utcnow() - timedelta(hours=2)
        runs = await self.db.scraper_runs.find(
            {"started_at": {"$gte": since}}
        ).sort("started_at", -1).to_list(500)

        if not runs:
            return None

        # Deduplicate: keep latest run per scraper
        latest = {}
        for r in runs:
            name = r.get("scraper_name", "")
            if name not in latest:
                latest[name] = r

        # Categorize
        failed = []
        degraded = []
        healthy = []
        total_new = 0
        total_items = 0

        for name, r in sorted(latest.items()):
            status = r.get("status", "unknown")
            items = r.get("items_found", 0)
            new = r.get("items_new", 0) or r.get("items_saved", 0)
            dur = r.get("duration_seconds")
            dur_str = f"{dur:.0f}s" if dur else "?"
            total_items += items
            total_new += new

            is_critical = name in CRITICAL_SCRAPERS
            min_expected = MIN_EXPECTED_ITEMS.get(name, 0)
            icon = "🔴" if is_critical else "🟡"

            if status in ("failed", "error"):
                err = (r.get("error_message") or r.get("error") or "")[:80]
                failed.append(f"{icon} {name}: FALLÓ ({dur_str}) {err}")
            elif status == "empty_suspicious":
                failed.append(f"{icon} {name}: 0 items (sospechoso)")
            elif min_expected > 0 and items < min_expected:
                degraded.append(f"⚠️ {name}: {items} items (esperados ≥{min_expected}, {dur_str})")
            elif status == "success":
                if new > 0:
                    healthy.append(f"✅ {name}: {items} items, +{new} nuevos ({dur_str})")
                else:
                    healthy.append(f"✅ {name}: {items} items ({dur_str})")

        # Build message
        now_str = _utcnow().strftime("%H:%M UTC")
        lines = [f"📊 *Salud Scrapers* — {now_str}"]
        lines.append(f"Ronda: {len(latest)} scrapers, {total_items} items, +{total_new} nuevos")
        lines.append("")

        if failed:
            lines.append("*FALLOS:*")
            lines.extend(failed)
            lines.append("")

        if degraded:
            lines.append("*DEGRADADOS:*")
            lines.extend(degraded)
            lines.append("")

        # Only show healthy summary (not each one) to keep message short
        healthy_count = len(healthy)
        if healthy_count > 0:
            # Show scrapers with new items individually
            with_new = [h for h in healthy if "+{" not in h and "nuevos" in h]
            if with_new:
                lines.append("*NUEVOS:*")
                lines.extend(with_new)
                lines.append("")
            lines.append(f"✅ {healthy_count} scrapers OK")

        # Only send if there are failures/degraded, or if there are new items
        if not failed and not degraded and total_new == 0:
            return None  # All quiet, don't spam

        return "\n".join(lines)

    async def _send_telegram(self, message: str):
        """Send health report via Telegram."""
        token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
        if not token or not chat_id:
            logger.warning("Telegram not configured for health monitor")
            return

        import aiohttp
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True,
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        logger.warning(f"Telegram send failed: {resp.status} {body[:100]}")
                    else:
                        logger.info("Health report sent to Telegram")
        except Exception as e:
            logger.warning(f"Telegram send error: {e}")


    async def run_daily_digest(self):
        """Daily digest: which sources brought 0 new items in the last 24h.

        Runs once a day (e.g. 21:00). Compares each active scraper's total
        new items over the day against its historical average.
        """
        try:
            report = await self._build_daily_report()
            if report:
                await self._send_telegram(report)
        except Exception as e:
            logger.error(f"Daily digest failed: {e}")

    async def _build_daily_report(self) -> Optional[str]:
        since = _utcnow() - timedelta(hours=24)

        # All active scraper configs
        configs = await self.db.scraper_configs.find(
            {"active": True}
        ).to_list(200)
        config_names = {c["name"] for c in configs}

        # All runs in the last 24h
        runs = await self.db.scraper_runs.find(
            {"started_at": {"$gte": since}}
        ).to_list(5000)

        # Aggregate per scraper: total runs, successes, total new items
        from collections import defaultdict
        stats = defaultdict(lambda: {"runs": 0, "success": 0, "new": 0, "items": 0, "failed": 0, "last_dur": 0})
        for r in runs:
            name = r.get("scraper_name", "")
            s = stats[name]
            s["runs"] += 1
            status = r.get("status", "")
            if status == "success":
                s["success"] += 1
            elif status in ("failed", "error"):
                s["failed"] += 1
            s["new"] += r.get("items_new", 0) or r.get("items_saved", 0)
            s["items"] = max(s["items"], r.get("items_found", 0))
            s["last_dur"] = r.get("duration_seconds") or s["last_dur"]

        # Categorize
        zero_new = []  # ran OK but 0 new items all day
        never_ran = []  # active config but no runs today
        high_fail = []  # >50% failure rate
        productive = []  # brought new items

        for name in sorted(config_names):
            s = stats.get(name)
            is_critical = name in CRITICAL_SCRAPERS
            icon = "🔴" if is_critical else "🟡"

            if not s or s["runs"] == 0:
                never_ran.append(f"{icon} {name}")
                continue

            fail_rate = s["failed"] / s["runs"] if s["runs"] > 0 else 0

            if fail_rate > 0.5:
                high_fail.append(f"{icon} {name}: {s['failed']}/{s['runs']} fallidos")
            elif s["new"] == 0 and s["success"] > 0:
                zero_new.append(f"⚪ {name}: {s['success']} runs OK, {s['items']} items, 0 nuevos")
            elif s["new"] > 0:
                productive.append(f"✅ {name}: +{s['new']} nuevos ({s['runs']} runs)")

        now_str = _utcnow().strftime("%d/%m %H:%M")
        lines = [f"📋 *Resumen Diario Scrapers* — {now_str}"]
        lines.append(f"{len(config_names)} fuentes activas, {sum(s['new'] for s in stats.values())} items nuevos hoy")
        lines.append("")

        if high_fail:
            lines.append("*🔴 ALTA TASA DE FALLOS (>50%):*")
            lines.extend(high_fail)
            lines.append("")

        if never_ran:
            lines.append("*⚠️ NO CORRIERON HOY:*")
            lines.extend(never_ran)
            lines.append("")

        if zero_new:
            lines.append("*⚪ SIN NOVEDADES (0 nuevos):*")
            lines.extend(zero_new)
            lines.append("")

        if productive:
            lines.append("*✅ CON NOVEDADES:*")
            lines.extend(productive)

        return "\n".join(lines)


_instance = None

def get_scraper_health_monitor(db):
    global _instance
    if _instance is None:
        _instance = ScraperHealthMonitor(db)
    return _instance
