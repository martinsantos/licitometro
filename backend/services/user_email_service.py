"""
User email service — transactional emails for the user lifecycle
(invitations, password resets, welcome, etc.).

Uses the local Postfix relay configured on the VPS, which signs every
outbound message with DKIM (selector mail2026, domain licitometro.ar).

Distinct from `notification_service.py` which only sends to a fixed
NOTIFICATION_EMAIL_TO inbox. This service supports arbitrary recipients
and templated bodies.
"""

import logging
import os
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from typing import Iterable, Optional

import aiosmtplib

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "172.18.0.1")
SMTP_PORT = int(os.getenv("SMTP_PORT", "25"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")

# Default sender identities for user emails (override per-call if needed)
DEFAULT_FROM_NAME = "Licitómetro"
DEFAULT_FROM_ADDR = os.getenv("USER_EMAIL_FROM", "noreply@licitometro.ar")
DEFAULT_REPLY_TO = os.getenv("USER_EMAIL_REPLY_TO", "hola@licitometro.ar")

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://licitometro.ar")


# ============================================================
# Low-level: send a single message
# ============================================================
async def send_email(
    to: Iterable[str],
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    from_name: str = DEFAULT_FROM_NAME,
    from_addr: str = DEFAULT_FROM_ADDR,
    reply_to: Optional[str] = DEFAULT_REPLY_TO,
) -> bool:
    """
    Send a transactional email via the local Postfix relay.

    Returns True on success, False on failure (and logs the error).
    Never raises — caller handles the boolean.
    """
    recipients = [r.strip() for r in to if r and r.strip()]
    if not recipients:
        logger.warning("send_email called with no recipients")
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_addr}>"
    msg["To"] = ", ".join(recipients)
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="licitometro.ar")
    if reply_to:
        msg["Reply-To"] = reply_to

    # Plain text fallback for clients that don't render HTML
    if text_body is None:
        text_body = _strip_html(html_body)
    msg.set_content(text_body, charset="utf-8")
    msg.add_alternative(html_body, subtype="html", charset="utf-8")

    try:
        kwargs = {"hostname": SMTP_HOST, "port": SMTP_PORT}
        if SMTP_USER and SMTP_PASSWORD:
            kwargs["username"] = SMTP_USER
            kwargs["password"] = SMTP_PASSWORD
            kwargs["start_tls"] = True
        else:
            kwargs["start_tls"] = False
            kwargs["use_tls"] = False
        await aiosmtplib.send(msg, **kwargs)
        logger.info("user_email sent: subject=%r to=%s", subject, recipients)
        return True
    except Exception as exc:
        logger.error("user_email send failed: %s", exc, exc_info=True)
        return False


def _strip_html(html: str) -> str:
    """Very minimal HTML→text fallback for the multipart alternative."""
    import re
    text = re.sub(r"<\s*br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"</\s*p\s*>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ============================================================
# Branded HTML wrapper
# ============================================================
def _wrap_brand(title: str, intro_html: str, cta_text: Optional[str] = None,
                cta_url: Optional[str] = None, after_cta_html: str = "") -> str:
    """Renders a clean transactional email with Licitómetro branding."""
    cta_html = ""
    if cta_text and cta_url:
        cta_html = f"""
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;">
          <tr><td align="center">
            <a href="{cta_url}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#fbbf24,#d97706);color:#1c1917;text-decoration:none;font-weight:700;font-size:15px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;">{cta_text}</a>
          </td></tr>
        </table>
        <p style="font-size:13px;color:#78716c;margin:0 0 4px;">O copiá y pegá este link en tu navegador:</p>
        <p style="font-size:12px;color:#a8a29e;word-break:break-all;margin:0 0 24px;">
          <a href="{cta_url}" style="color:#d97706;">{cta_url}</a>
        </p>
        """

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Inter',Helvetica,Arial,sans-serif;color:#1c1917;line-height:1.6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f4;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px -8px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr><td style="padding:32px 40px 20px;background:linear-gradient(135deg,#1c1917 0%,#292524 100%);color:#fafaf9;">
          <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em;">
            LICITÓMETRO<span style="display:inline-block;margin-left:8px;padding:3px 8px;background:#10b981;color:#fff;font-size:10px;font-weight:700;border-radius:4px;vertical-align:middle;">BETA</span>
          </div>
          <div style="font-size:13px;color:#a8a29e;margin-top:4px;">{title}</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px 32px;color:#1c1917;font-size:15px;">
          {intro_html}
          {cta_html}
          {after_cta_html}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;background:#fafaf9;border-top:1px solid #e7e5e4;font-size:12px;color:#78716c;text-align:center;">
          <div style="margin-bottom:6px;">
            <strong style="color:#44403c;">Licitómetro</strong> · Mendoza, Argentina
          </div>
          <div>
            <a href="{PUBLIC_BASE_URL}" style="color:#d97706;text-decoration:none;">licitometro.ar</a>
            &nbsp;·&nbsp;
            <a href="{PUBLIC_BASE_URL}/manual/all.html" style="color:#d97706;text-decoration:none;">Manual</a>
          </div>
          <div style="margin-top:12px;color:#a8a29e;">
            Recibís este correo porque alguien (probablemente vos) lo solicitó desde licitometro.ar.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


# ============================================================
# Templated emails — high-level API
# ============================================================
async def send_invitation(
    to: str,
    nombre: str,
    activation_token: str,
    invited_by: Optional[str] = None,
    expires_in: str = "7 días",
) -> bool:
    """
    Send an account-creation invitation email.
    `activation_token` is appended to the activation URL.
    """
    activation_url = f"{PUBLIC_BASE_URL}/activar?token={activation_token}"
    invited_line = f"<p>{invited_by} te invitó a usar Licitómetro.</p>" if invited_by else ""
    intro = f"""
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#1c1917;letter-spacing:-0.01em;">
      Hola {nombre} 👋
    </h2>
    {invited_line}
    <p style="margin:0 0 12px;">
      Tenés una invitación para crear tu cuenta en <strong>Licitómetro</strong>,
      la plataforma de licitaciones públicas de Mendoza con HUNTER cross-source
      y CotizAR asistido por IA.
    </p>
    <p style="margin:0;">
      Hacé clic en el botón de abajo para activar tu cuenta y elegir una contraseña.
    </p>
    """
    after = f"""
    <p style="font-size:13px;color:#78716c;margin:24px 0 0;border-top:1px solid #e7e5e4;padding-top:16px;">
      <strong>Importante:</strong> este link expira en {expires_in}.
      Si no esperabas esta invitación, podés ignorar este correo.
    </p>
    """
    return await send_email(
        to=[to],
        subject="Tu invitación a Licitómetro",
        html_body=_wrap_brand("Invitación a Licitómetro", intro,
                              cta_text="Activar mi cuenta",
                              cta_url=activation_url,
                              after_cta_html=after),
    )


async def send_password_reset(to: str, nombre: str, reset_token: str) -> bool:
    """Send a password reset link."""
    reset_url = f"{PUBLIC_BASE_URL}/reset-password?token={reset_token}"
    intro = f"""
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#1c1917;letter-spacing:-0.01em;">
      Restablecer contraseña
    </h2>
    <p style="margin:0 0 12px;">Hola {nombre},</p>
    <p style="margin:0;">
      Recibimos una solicitud para restablecer la contraseña de tu cuenta en
      Licitómetro. Hacé clic en el botón de abajo para elegir una nueva.
    </p>
    """
    after = """
    <p style="font-size:13px;color:#78716c;margin:24px 0 0;border-top:1px solid #e7e5e4;padding-top:16px;">
      <strong>Importante:</strong> este link expira en <strong>1 hora</strong>.
      Si no pediste restablecer tu contraseña, ignorá este correo —
      tu contraseña actual sigue intacta.
    </p>
    """
    return await send_email(
        to=[to],
        subject="Restablecer contraseña — Licitómetro",
        html_body=_wrap_brand("Restablecer contraseña", intro,
                              cta_text="Elegir nueva contraseña",
                              cta_url=reset_url,
                              after_cta_html=after),
    )


async def send_welcome(to: str, nombre: str) -> bool:
    """Send a welcome email after the user finishes activation."""
    intro = f"""
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#1c1917;letter-spacing:-0.01em;">
      ¡Bienvenido, {nombre}! 🎉
    </h2>
    <p style="margin:0 0 12px;">
      Tu cuenta en Licitómetro está lista. Ya podés empezar a explorar las
      <strong>10,000+ licitaciones</strong> indexadas de las 24 fuentes de
      Mendoza, configurar tus rubros de interés y armar tu primera cotización.
    </p>
    <p style="margin:0;">
      Para empezar te recomendamos pasar por el manual:
    </p>
    """
    after = f"""
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:16px;">
      <tr>
        <td style="padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;font-size:13px;color:#92400e;">
          <strong>💡 Tip:</strong> activá los rubros que te interesan en tu perfil
          y vas a recibir un digest diario por email a las 9:00 AM.
        </td>
      </tr>
    </table>
    """
    return await send_email(
        to=[to],
        subject="Bienvenido a Licitómetro",
        html_body=_wrap_brand("¡Cuenta activada!", intro,
                              cta_text="Leer el manual",
                              cta_url=f"{PUBLIC_BASE_URL}/manual/all.html",
                              after_cta_html=after),
    )


async def send_test(to: str) -> bool:
    """Quick deliverability check from the admin panel."""
    intro = """
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#1c1917;letter-spacing:-0.01em;">
      ✅ SMTP test exitoso
    </h2>
    <p style="margin:0 0 12px;">
      Si estás leyendo este correo, el servidor SMTP de Licitómetro
      (Postfix + OpenDKIM en el VPS) está enviando correctamente.
    </p>
    <p style="margin:0;">Detalles técnicos:</p>
    <ul style="margin:8px 0 0;padding-left:20px;">
      <li>Origen: <code>noreply@licitometro.ar</code></li>
      <li>Firma DKIM: <code>mail2026._domainkey.licitometro.ar</code></li>
      <li>Relay: <code>172.18.0.1:25</code> (Postfix local)</li>
    </ul>
    """
    return await send_email(
        to=[to],
        subject="[TEST] SMTP de Licitómetro",
        html_body=_wrap_brand("SMTP test", intro),
    )
