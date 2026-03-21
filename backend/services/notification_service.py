"""
Notification service - Telegram and Email notifications.

Triggers:
- New licitaciones scraped → Telegram (immediate)
- Scraper error → Telegram (immediate)
- Daily digest at 9am → Telegram + Email
"""

import os
import uuid
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

import aiohttp
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formatdate, make_msgid

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("notification_service")

# Telegram config
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

# SMTP config
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "25"))
SMTP_FROM = os.environ.get("SMTP_FROM", "")
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
NOTIFICATION_EMAIL_TO = os.environ.get("NOTIFICATION_EMAIL_TO", "")


class NotificationService:
    def __init__(self, database: AsyncIOMotorDatabase):
        self.db = database

    @property
    def telegram_enabled(self) -> bool:
        return bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)

    @property
    def email_enabled(self) -> bool:
        return bool(SMTP_HOST and NOTIFICATION_EMAIL_TO and (SMTP_FROM or SMTP_USER))

    async def send_telegram(self, message: str) -> bool:
        """Send a message via Telegram Bot API."""
        if not self.telegram_enabled:
            logger.debug("Telegram not configured, skipping")
            return False

        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as resp:
                    if resp.status == 200:
                        return True
                    body = await resp.text()
                    logger.error(f"Telegram API error {resp.status}: {body}")
                    return False
        except Exception as e:
            logger.error(f"Telegram send failed: {e}")
            return False

    async def send_email(self, subject: str, html_body: str) -> bool:
        """Send an email via SMTP."""
        if not self.email_enabled:
            logger.debug("Email not configured, skipping")
            return False

        sender = SMTP_FROM or SMTP_USER
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = NOTIFICATION_EMAIL_TO
        msg["Message-ID"] = make_msgid(domain="licitometro.ar")
        msg["Date"] = formatdate(localtime=True)
        msg.attach(MIMEText(html_body, "html"))

        try:
            kwargs = {
                "hostname": SMTP_HOST,
                "port": SMTP_PORT,
            }
            if SMTP_USER and SMTP_PASSWORD:
                kwargs["username"] = SMTP_USER
                kwargs["password"] = SMTP_PASSWORD
                kwargs["start_tls"] = True
            else:
                kwargs["start_tls"] = False
                kwargs["use_tls"] = False
            await aiosmtplib.send(msg, **kwargs)
            return True
        except Exception as e:
            logger.error(f"Email send failed: {e}")
            return False

    async def send_telegram_to_chat(self, message: str, chat_id: str) -> bool:
        """Send a message to a specific Telegram chat (not the default one)."""
        if not TELEGRAM_BOT_TOKEN:
            logger.debug("Telegram bot token not configured, skipping")
            return False

        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as resp:
                    if resp.status == 200:
                        return True
                    body = await resp.text()
                    logger.error(f"Telegram API error {resp.status} (chat {chat_id}): {body}")
                    return False
        except Exception as e:
            logger.error(f"Telegram send to chat {chat_id} failed: {e}")
            return False

    async def send_email_to(self, recipients: List[str], subject: str, html_body: str) -> bool:
        """Send an email to specific recipients (not the default one)."""
        if not SMTP_HOST:
            logger.debug("SMTP not configured, skipping")
            return False

        sender = SMTP_FROM or SMTP_USER
        if not sender:
            return False

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = ", ".join(recipients)
        msg["Message-ID"] = make_msgid(domain="licitometro.ar")
        msg["Date"] = formatdate(localtime=True)
        msg.attach(MIMEText(html_body, "html"))

        try:
            kwargs = {
                "hostname": SMTP_HOST,
                "port": SMTP_PORT,
            }
            if SMTP_USER and SMTP_PASSWORD:
                kwargs["username"] = SMTP_USER
                kwargs["password"] = SMTP_PASSWORD
                kwargs["start_tls"] = True
            else:
                kwargs["start_tls"] = False
                kwargs["use_tls"] = False
            await aiosmtplib.send(msg, recipients=recipients, **kwargs)
            return True
        except Exception as e:
            logger.error(f"Email send to {recipients} failed: {e}")
            return False

    async def notify_new_licitaciones(self, items: List[Dict[str, Any]], scraper_name: str):
        """Notify about newly scraped licitaciones (Telegram only, immediate)."""
        if not items:
            return

        count = len(items)
        titles = []
        for item in items[:5]:
            title = item.get("title", "Sin titulo")[:80]
            titles.append(f"  - {title}")

        extra = f"\n  ... y {count - 5} mas" if count > 5 else ""
        message = (
            f"<b>Nuevas licitaciones ({count})</b>\n"
            f"Fuente: {scraper_name}\n\n"
            + "\n".join(titles)
            + extra
        )
        await self.send_telegram(message)

    async def notify_scraper_error(self, scraper_name: str, error: str):
        """Notify about a scraper error (Telegram, immediate). Legacy — kept for compat."""
        message = (
            f"<b>Error en scraper</b>\n"
            f"Scraper: {scraper_name}\n"
            f"Error: {error[:200]}"
        )
        await self.send_telegram(message)

    async def notify_scraper_error_enhanced(
        self,
        scraper_name: str,
        error: str,
        consecutive_failures: int = 1,
        last_success_at: Optional[datetime] = None,
        total_records: int = 0,
        scraper_url: str = "",
        retry_count: int = 0,
    ):
        """Enhanced scraper error notification with context and severity levels."""
        # Severity header
        if consecutive_failures >= 10:
            header = "CRITICO: Scraper fuera de servicio"
        elif consecutive_failures >= 5:
            header = "ALERTA: Fallas persistentes"
        else:
            header = "Error en scraper"

        # Last success relative time
        if last_success_at:
            delta = datetime.utcnow() - last_success_at
            hours = int(delta.total_seconds() / 3600)
            if hours < 1:
                last_success_str = f"hace {int(delta.total_seconds() / 60)}min"
            elif hours < 48:
                last_success_str = f"hace {hours}h"
            else:
                last_success_str = f"hace {hours // 24} dias"
        else:
            last_success_str = "nunca"

        lines = [f"<b>{header}</b>"]
        lines.append(f"Scraper: {scraper_name}")
        if scraper_url:
            lines.append(f"URL: {scraper_url[:80]}")
        lines.append(f"Error: {error[:500]}")
        lines.append(f"Fallas consecutivas: {consecutive_failures}")
        lines.append(f"Ultimo exito: {last_success_str}")
        if total_records > 0:
            lines.append(f"Records en riesgo: {total_records}")
        if retry_count > 0:
            lines.append(f"Reintento: #{retry_count}")

        await self.send_telegram("\n".join(lines))

    async def send_daily_digest(self):
        """Send daily digest with summary of last 24h activity + per-scraper breakdown."""
        try:
            since = datetime.utcnow() - timedelta(hours=24)

            # Count new licitaciones
            new_count = await self.db.licitaciones.count_documents(
                {"created_at": {"$gte": since}}
            )

            # Per-scraper breakdown
            scraper_stats = await self.db.scraper_runs.aggregate([
                {"$match": {"started_at": {"$gte": since}}},
                {"$group": {
                    "_id": "$scraper_name",
                    "success": {"$sum": {"$cond": [{"$eq": ["$status", "success"]}, 1, 0]}},
                    "failed": {"$sum": {"$cond": [{"$in": ["$status", ["failed", "empty_suspicious"]]}, 1, 0]}},
                    "partial": {"$sum": {"$cond": [{"$eq": ["$status", "partial"]}, 1, 0]}},
                }},
                {"$sort": {"failed": -1, "_id": 1}},
            ]).to_list(length=100)

            total_success = sum(s["success"] for s in scraper_stats)
            total_failed = sum(s["failed"] for s in scraper_stats)

            # Find licitaciones with opening_date in next 48h
            now = datetime.utcnow()
            upcoming = await self.db.licitaciones.count_documents({
                "opening_date": {
                    "$gte": now,
                    "$lte": now + timedelta(hours=48),
                }
            })

            total = await self.db.licitaciones.estimated_document_count()

            # Needs repair scrapers
            repair_scrapers = await self.db.scraper_configs.find(
                {"needs_repair": True}
            ).to_list(length=50)

            # Build message
            lines = [
                "<b>Resumen diario - Licitometro</b>",
                f"Nuevas licitaciones (24h): {new_count}",
                f"Total en base: {total}",
                f"Scraper runs: {total_success} ok, {total_failed} fallidos",
            ]

            if upcoming > 0:
                lines.append(f"<b>Aperturas proximas (48h): {upcoming}</b>")

            # Per-scraper failure details
            failed_scrapers = [s for s in scraper_stats if s["failed"] > 0]
            if failed_scrapers:
                lines.append("")
                lines.append("<b>Scrapers con fallas:</b>")
                for s in failed_scrapers:
                    name = s["_id"]
                    repair_marker = " REPAIR" if any(r.get("name") == name for r in repair_scrapers) else ""
                    lines.append(f"  {name}: {s['failed']} fallas, {s['success']} ok{repair_marker}")

            # Needs repair section
            if repair_scrapers:
                lines.append("")
                lines.append("<b>Necesitan reparacion:</b>")
                for r in repair_scrapers:
                    since_repair = r.get("needs_repair_since")
                    if since_repair:
                        delta = datetime.utcnow() - since_repair
                        duration = f"hace {delta.days}d" if delta.days > 0 else f"hace {int(delta.total_seconds() / 3600)}h"
                    else:
                        duration = "?"
                    lines.append(f"  {r.get('name')}: desde {duration}")

            if not failed_scrapers and not repair_scrapers:
                lines.append("\nTodos los scrapers OK")

            message = "\n".join(lines)

            # Send both channels
            await self.send_telegram(message)

            if self.email_enabled:
                html = message.replace("\n", "<br>")
                await self.send_email("Licitometro - Resumen Diario", html)

            logger.info("Daily digest sent")

        except Exception as e:
            logger.error(f"Failed to send daily digest: {e}")


    async def send_deadline_alerts(self):
        """Send Telegram alerts for licitaciones opening in ~48h.

        Only alerts items with a nodo, workflow state evaluando/preparando,
        and not already alerted (metadata.deadline_alert_sent != true).
        """
        try:
            now = datetime.utcnow()
            window_end = now + timedelta(hours=48)
            window_start = window_end - timedelta(hours=4)

            items = await self.db.licitaciones.find({
                "opening_date": {"$gte": window_start, "$lte": window_end},
                "nodos": {"$exists": True, "$not": {"$size": 0}},
                "workflow_state": {"$in": ["evaluando", "preparando"]},
                "metadata.deadline_alert_sent": {"$ne": True},
            }).to_list(50)

            if not items:
                logger.info("No deadline alerts to send")
                return

            logger.info(f"Sending deadline alerts for {len(items)} licitaciones")

            for item in items:
                try:
                    display = item.get("objeto") or item.get("title", "Sin título")
                    org = item.get("organization", "")
                    opening = item.get("opening_date")
                    opening_str = opening.strftime("%d/%m/%Y %H:%M") if opening else "N/A"
                    lic_id = str(item["_id"])

                    msg = (
                        f"⏰ <b>Apertura en 48hs</b>\n"
                        f"{display[:200]}\n"
                        f"Organismo: {org}\n"
                        f"Apertura: {opening_str}\n"
                        f"https://licitometro.ar/licitaciones/{lic_id}"
                    )
                    await self.send_telegram(msg)

                    await self.db.licitaciones.update_one(
                        {"_id": item["_id"]},
                        {"$set": {"metadata.deadline_alert_sent": True}},
                    )
                except Exception as e:
                    logger.error(f"Failed deadline alert for {item.get('_id')}: {e}")

        except Exception as e:
            logger.error(f"send_deadline_alerts failed: {e}")


_notification_service: Optional[NotificationService] = None


def get_notification_service(database: AsyncIOMotorDatabase) -> NotificationService:
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService(database)
    return _notification_service
