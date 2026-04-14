"""
Scraper Health Monitor — runs after each scraping round and reports status.

Checks all scraper runs from the last round, detects failures, degraded
performance, and silent issues. Sends a summary via Telegram.
"""
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger("scraper_health_monitor")

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


_instance = None

def get_scraper_health_monitor(db):
    global _instance
    if _instance is None:
        _instance = ScraperHealthMonitor(db)
    return _instance
