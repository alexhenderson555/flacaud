"""Outbound transactional email (password reset, etc.)."""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage

import httpx

log = logging.getLogger(__name__)


def public_site_base() -> str:
    return os.environ.get("TIDALDLRU_PUBLIC_API_BASE", "https://flacaud.ru").rstrip("/")


def email_from_address() -> str | None:
    return (
        os.environ.get("TIDALDLRU_SMTP_FROM")
        or os.environ.get("TIDALDLRU_EMAIL_FROM")
        or None
    )


def _smtp_configured() -> bool:
    return bool(os.environ.get("TIDALDLRU_SMTP_HOST") and email_from_address())


def _resend_configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY") and email_from_address())


def email_configured() -> bool:
    return _resend_configured() or _smtp_configured()


def _password_reset_content(*, to_email: str, reset_url: str, username: str | None) -> tuple[str, str, str]:
    display_name = username or to_email.split("@", 1)[0]
    subject = "FlacAud — reset your password"
    text = (
        f"Hi {display_name},\n\n"
        f"We received a request to reset your FlacAud password.\n"
        f"Open this link to choose a new password (valid for 1 hour):\n\n"
        f"{reset_url}\n\n"
        f"If you did not request this, you can ignore this email.\n\n"
        f"— FlacAud"
    )
    html = f"""\
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>Hi {display_name},</p>
<p>We received a request to reset your <strong>FlacAud</strong> password.</p>
<p><a href="{reset_url}" style="display:inline-block;padding:12px 20px;background:#2575fc;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Reset password</a></p>
<p style="font-size:14px;color:#555">Or copy this link:<br><a href="{reset_url}">{reset_url}</a></p>
<p style="font-size:14px;color:#777">This link expires in 1 hour. If you did not request a reset, ignore this email.</p>
</body></html>"""
    return subject, text, html


def _send_via_resend(*, to_email: str, subject: str, text: str, html: str) -> bool:
    from_addr = email_from_address()
    api_key = os.environ.get("RESEND_API_KEY", "")
    if not from_addr or not api_key:
        return False
    try:
        with httpx.Client(timeout=30) as client:
            res = client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": from_addr,
                    "to": [to_email],
                    "subject": subject,
                    "html": html,
                    "text": text,
                },
            )
        if res.status_code >= 400:
            log.error(
                "password_reset_resend_failed to=%s status=%s body=%s",
                to_email,
                res.status_code,
                res.text[:500],
                extra={"event": "password_reset_resend_failed"},
            )
            return False
    except Exception:
        log.exception(
            "password_reset_resend_failed to=%s",
            to_email,
            extra={"event": "password_reset_resend_failed"},
        )
        return False
    return True


def _send_via_smtp(*, to_email: str, subject: str, text: str, html: str) -> bool:
    from_addr = email_from_address()
    if not from_addr:
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    host = os.environ["TIDALDLRU_SMTP_HOST"]
    port = int(os.environ.get("TIDALDLRU_SMTP_PORT", "587"))
    user = os.environ.get("TIDALDLRU_SMTP_USER") or None
    password = os.environ.get("TIDALDLRU_SMTP_PASSWORD") or None
    use_tls = os.environ.get("TIDALDLRU_SMTP_TLS", "true").lower() in ("1", "true", "yes", "on")

    try:
        if use_tls:
            with smtplib.SMTP(host, port, timeout=30) as smtp:
                smtp.ehlo()
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
                if user and password:
                    smtp.login(user, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP_SSL(host, port, timeout=30, context=ssl.create_default_context()) as smtp:
                if user and password:
                    smtp.login(user, password)
                smtp.send_message(msg)
    except Exception:
        log.exception(
            "password_reset_smtp_failed to=%s",
            to_email,
            extra={"event": "password_reset_smtp_failed"},
        )
        return False
    return True


def _dispatch_email(*, to_email: str, subject: str, text: str, html: str) -> bool:
    if _resend_configured():
        return _send_via_resend(to_email=to_email, subject=subject, text=text, html=html)
    if _smtp_configured():
        return _send_via_smtp(to_email=to_email, subject=subject, text=text, html=html)
    return False


def send_password_reset_email(*, to_email: str, reset_url: str, username: str | None = None) -> bool:
    if not email_configured():
        log.warning(
            "password_reset_email_skipped to=%s reason=email_not_configured",
            to_email,
            extra={"event": "password_reset_email_skipped"},
        )
        return False

    subject, text, html = _password_reset_content(
        to_email=to_email,
        reset_url=reset_url,
        username=username,
    )

    ok = _dispatch_email(to_email=to_email, subject=subject, text=text, html=html)
    if ok:
        log.info(
            "password_reset_email_sent to=%s via=%s",
            to_email,
            "resend" if _resend_configured() else "smtp",
            extra={"event": "password_reset_email_sent"},
        )
    return ok


def _email_verify_content(*, to_email: str, verify_url: str, username: str | None) -> tuple[str, str, str]:
    display_name = username or to_email.split("@", 1)[0]
    subject = "FlacAud — verify your email"
    text = (
        f"Hi {display_name},\n\n"
        f"Welcome to FlacAud. Please verify your email address:\n\n"
        f"{verify_url}\n\n"
        f"This link is valid for 3 days.\n\n"
        f"— FlacAud"
    )
    html = f"""\
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>Hi {display_name},</p>
<p>Welcome to <strong>FlacAud</strong>. Please verify your email address:</p>
<p><a href="{verify_url}" style="display:inline-block;padding:12px 20px;background:#2575fc;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Verify email</a></p>
<p style="font-size:14px;color:#555">Or copy this link:<br><a href="{verify_url}">{verify_url}</a></p>
</body></html>"""
    return subject, text, html


def send_email_verification(*, to_email: str, verify_url: str, username: str | None = None) -> bool:
    if not email_configured():
        log.warning(
            "email_verify_skipped to=%s reason=email_not_configured",
            to_email,
            extra={"event": "email_verify_skipped"},
        )
        return False

    subject, text, html = _email_verify_content(
        to_email=to_email,
        verify_url=verify_url,
        username=username,
    )

    ok = _dispatch_email(to_email=to_email, subject=subject, text=text, html=html)
    if ok:
        log.info(
            "email_verify_sent to=%s",
            to_email,
            extra={"event": "email_verify_sent"},
        )
    return ok


def send_subscription_reminder_email(
    *,
    to_email: str,
    username: str | None,
    plan: str,
    expires_at: datetime,
    days_left: int,
    renew_url: str,
) -> bool:
    if not email_configured():
        log.warning(
            "subscription_reminder_skipped to=%s reason=email_not_configured",
            to_email,
            extra={"event": "subscription_reminder_skipped"},
        )
        return False

    display_name = username or to_email.split("@", 1)[0]
    expiry_str = expires_at.astimezone(timezone.utc).strftime("%Y-%m-%d")
    subject = f"FlacAud — your {plan} plan expires in {days_left} day(s)"
    text = (
        f"Hi {display_name},\n\n"
        f"Your FlacAud {plan} subscription expires on {expiry_str} "
        f"({days_left} day(s) left).\n\n"
        f"Renew to keep lossless downloads and your daily quota:\n{renew_url}\n\n"
        f"— FlacAud"
    )
    html = f"""\
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>Hi {display_name},</p>
<p>Your <strong>FlacAud {plan}</strong> subscription expires on <strong>{expiry_str}</strong> ({days_left} day(s) left).</p>
<p><a href="{renew_url}" style="display:inline-block;padding:12px 20px;background:#2575fc;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Renew plan</a></p>
</body></html>"""

    ok = _dispatch_email(to_email=to_email, subject=subject, text=text, html=html)
    if ok:
        log.info(
            "subscription_reminder_email_sent to=%s",
            to_email,
            extra={"event": "subscription_reminder_email_sent"},
        )
    return ok
