"""
Notification service - Telegram and Email notifications.

Triggers:
- New licitaciones scraped → Telegram (immediate)
- Scraper error → Telegram (immediate)
- Daily digest at 9am → Telegram + Email
"""

import os
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

import aiohttp
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("notification_service")

# Telegram config
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

# SMTP config
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
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
        return bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD and NOTIFICATION_EMAIL_TO)

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

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_USER
        msg["To"] = NOTIFICATION_EMAIL_TO
        msg.attach(MIMEText(html_body, "html"))

        try:
            await aiosmtplib.send(
                msg,
                hostname=SMTP_HOST,
                port=SMTP_PORT,
                username=SMTP_USER,
                password=SMTP_PASSWORD,
                start_tls=True,
            )
            return True
        except Exception as e:
            logger.error(f"Email send failed: {e}")
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
        """Notify about a scraper error (Telegram, immediate)."""
        message = (
            f"<b>Error en scraper</b>\n"
            f"Scraper: {scraper_name}\n"
            f"Error: {error[:200]}"
        )
        await self.send_telegram(message)

    async def send_daily_digest(self):
        """Send daily digest with summary of last 24h activity."""
        try:
            since = datetime.utcnow() - timedelta(hours=24)

            # Count new licitaciones
            new_count = await self.db.licitaciones.count_documents(
                {"created_at": {"$gte": since}}
            )

            # Count scraper runs
            runs = await self.db.scraper_runs.find(
                {"started_at": {"$gte": since}}
            ).to_list(length=100)

            success_runs = sum(1 for r in runs if r.get("status") == "success")
            failed_runs = sum(1 for r in runs if r.get("status") == "failed")

            # Find licitaciones with opening_date in next 48h
            now = datetime.utcnow()
            upcoming = await self.db.licitaciones.count_documents({
                "opening_date": {
                    "$gte": now,
                    "$lte": now + timedelta(hours=48),
                }
            })

            total = await self.db.licitaciones.estimated_document_count()

            # Build message
            lines = [
                "<b>Resumen diario - Licitometro</b>",
                f"Nuevas licitaciones (24h): {new_count}",
                f"Total en base: {total}",
                f"Scraper runs: {success_runs} ok, {failed_runs} fallidos",
            ]

            if upcoming > 0:
                lines.append(f"<b>Aperturas proximas (48h): {upcoming}</b>")

            message = "\n".join(lines)

            # Send both channels
            await self.send_telegram(message)

            if self.email_enabled:
                html = message.replace("\n", "<br>")
                await self.send_email("Licitometro - Resumen Diario", html)

            logger.info("Daily digest sent")

        except Exception as e:
            logger.error(f"Failed to send daily digest: {e}")


_notification_service: Optional[NotificationService] = None


def get_notification_service(database: AsyncIOMotorDatabase) -> NotificationService:
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService(database)
    return _notification_service
