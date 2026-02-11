"""
Nodo Digest Service - sends periodic digest notifications for nodos.

Frequencies:
- daily: 1x/day at 9:15am
- twice_daily: 2x/day at 9:15am and 6pm
- none: disabled

Each digest groups new licitaciones matched to a nodo since last_digest_sent.
Sends via enabled nodo actions (telegram, email) with clickable public-access links.
"""

import logging
from datetime import datetime
from typing import List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("nodo_digest_service")

SITE_URL = "https://licitometro.ar"
MAX_TELEGRAM_ITEMS = 10
MAX_EMAIL_ITEMS = 20


class NodoDigestService:
    def __init__(self, database: AsyncIOMotorDatabase):
        self.db = database

    async def run_digest(self, frequencies: List[str]):
        """Process digests for nodos with the given frequencies."""
        from services.notification_service import get_notification_service
        self.notifier = get_notification_service(self.db)

        query = {
            "active": True,
            "digest_frequency": {"$in": frequencies},
        }
        cursor = self.db.nodos.find(query)
        nodos = await cursor.to_list(length=200)

        if not nodos:
            logger.info(f"No active nodos with frequencies {frequencies}")
            return

        logger.info(f"Processing digest for {len(nodos)} nodos (frequencies={frequencies})")

        for nodo in nodos:
            try:
                await self._process_nodo_digest(nodo)
            except Exception as e:
                logger.error(f"Digest failed for nodo '{nodo.get('name')}': {e}")

    async def _process_nodo_digest(self, nodo: dict):
        """Compile and send digest for a single nodo."""
        nodo_id = str(nodo["_id"])
        nodo_name = nodo.get("name", "?")

        # Find new licitaciones since last digest
        since = nodo.get("last_digest_sent")
        lic_query = {"nodos": nodo_id}
        if since:
            lic_query["fecha_scraping"] = {"$gt": since}

        items = await self.db.licitaciones.find(lic_query).sort(
            "fecha_scraping", -1
        ).to_list(length=MAX_EMAIL_ITEMS + 1)

        if not items:
            logger.debug(f"No new items for nodo '{nodo_name}', skipping")
            return

        total_new = len(items)
        logger.info(f"Nodo '{nodo_name}': {total_new} new items")

        # Generate public access token for links
        from services.auth_service import create_public_access_token
        token = create_public_access_token(ttl_days=30)

        # Process each enabled action
        actions = nodo.get("actions", [])
        sent_any = False

        for action in actions:
            if not action.get("enabled"):
                continue

            action_type = action.get("type")
            config = action.get("config", {})

            try:
                if action_type == "telegram":
                    chat_id = config.get("chat_id")
                    if chat_id:
                        msg = self._build_telegram_digest(nodo, items, token, total_new)
                        ok = await self.notifier.send_telegram_to_chat(msg, chat_id)
                        if ok:
                            sent_any = True
                            logger.info(f"Telegram digest sent for '{nodo_name}' to chat {chat_id}")

                elif action_type == "email":
                    # Normalize recipients: split any semicolon-joined addresses
                    raw_to = config.get("to", [])
                    recipients = []
                    for addr in raw_to:
                        for part in addr.split(";"):
                            part = part.strip()
                            if part:
                                recipients.append(part)
                    if recipients:
                        subject_prefix = config.get("subject_prefix", "")
                        subject = f"{subject_prefix} {total_new} nuevas licitaciones - {nodo_name}".strip()
                        html = self._build_email_digest(nodo, items, token, total_new)
                        ok = await self.notifier.send_email_to(recipients, subject, html)
                        if ok:
                            sent_any = True
                            logger.info(f"Email digest sent for '{nodo_name}' to {recipients}")

            except Exception as e:
                logger.error(f"Action {action_type} failed for nodo '{nodo_name}': {e}")

        # Update last_digest_sent regardless of whether actions existed
        await self.db.nodos.update_one(
            {"_id": nodo["_id"]},
            {"$set": {"last_digest_sent": datetime.utcnow()}}
        )

    def _build_telegram_digest(self, nodo: dict, items: list, token: str, total: int) -> str:
        """Build Telegram HTML message with clickable links."""
        color_emoji = "\U0001f4cb"  # clipboard
        name = nodo.get("name", "?")

        lines = [
            f"{color_emoji} <b>Nodo: {name}</b>",
            f"{total} nueva{'s' if total != 1 else ''} licitaci{'ones' if total != 1 else 'on'}",
            "",
        ]

        for i, item in enumerate(items[:MAX_TELEGRAM_ITEMS]):
            num = i + 1
            title = (item.get("objeto") or item.get("title", "Sin titulo"))[:100]
            org = (item.get("organization") or "")[:50]
            budget = item.get("budget")
            lic_id = str(item["_id"])
            link = f"{SITE_URL}/licitacion/{lic_id}?token={token}"

            budget_str = ""
            if budget:
                budget_str = f" | ${budget:,.0f}".replace(",", ".")

            lines.append(f"{num}. <b>{title}</b>")
            if org or budget_str:
                lines.append(f"   {org}{budget_str}")
            lines.append(f"   <a href=\"{link}\">Ver detalle</a>")

        if total > MAX_TELEGRAM_ITEMS:
            lines.append(f"\n... y {total - MAX_TELEGRAM_ITEMS} mas")

        return "\n".join(lines)

    def _build_email_digest(self, nodo: dict, items: list, token: str, total: int) -> str:
        """Build HTML email with table of licitaciones."""
        name = nodo.get("name", "?")
        color = nodo.get("color", "#3B82F6")

        rows = []
        for item in items[:MAX_EMAIL_ITEMS]:
            title = (item.get("objeto") or item.get("title", "Sin titulo"))[:120]
            org = (item.get("organization") or "-")[:60]
            budget = item.get("budget")
            budget_str = f"${budget:,.0f}".replace(",", ".") if budget else "-"
            opening = ""
            if item.get("opening_date"):
                try:
                    od = item["opening_date"]
                    if isinstance(od, datetime):
                        opening = od.strftime("%d/%m/%Y %H:%M")
                    elif isinstance(od, str):
                        opening = od[:16]
                except Exception:
                    opening = str(item["opening_date"])[:16]
            lic_id = str(item["_id"])
            link = f"{SITE_URL}/licitacion/{lic_id}?token={token}"

            rows.append(f"""
            <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;">
                    <a href="{link}" style="color:#1a56db;text-decoration:none;font-weight:600;">{title}</a>
                </td>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;">{org}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;text-align:right;">{budget_str}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;">{opening}</td>
            </tr>""")

        extra = ""
        if total > MAX_EMAIL_ITEMS:
            extra = f'<p style="color:#888;font-size:13px;">... y {total - MAX_EMAIL_ITEMS} licitaciones mas</p>'

        return f"""
        <div style="font-family:sans-serif;max-width:700px;margin:0 auto;">
            <div style="background:{color};color:white;padding:16px 20px;border-radius:8px 8px 0 0;">
                <h2 style="margin:0;font-size:18px;">Nodo: {name}</h2>
                <p style="margin:4px 0 0;font-size:14px;opacity:0.9;">{total} nueva{'s' if total != 1 else ''} licitaci{'ones' if total != 1 else 'on'}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                    <tr style="background:#f9fafb;">
                        <th style="padding:10px 12px;text-align:left;font-weight:700;color:#374151;">Licitacion</th>
                        <th style="padding:10px 12px;text-align:left;font-weight:700;color:#374151;">Organizacion</th>
                        <th style="padding:10px 12px;text-align:right;font-weight:700;color:#374151;">Presupuesto</th>
                        <th style="padding:10px 12px;text-align:left;font-weight:700;color:#374151;">Apertura</th>
                    </tr>
                </thead>
                <tbody>
                    {''.join(rows)}
                </tbody>
            </table>
            {extra}
            <div style="padding:16px 20px;background:#f9fafb;border-radius:0 0 8px 8px;border-top:1px solid #eee;">
                <a href="{SITE_URL}/licitaciones?nodo={str(nodo['_id'])}" style="color:#1a56db;font-size:13px;">
                    Ver todas en Licitometro
                </a>
            </div>
        </div>
        """


_nodo_digest_service: Optional[NodoDigestService] = None


def get_nodo_digest_service(database: AsyncIOMotorDatabase) -> NodoDigestService:
    global _nodo_digest_service
    if _nodo_digest_service is None:
        _nodo_digest_service = NodoDigestService(database)
    return _nodo_digest_service
