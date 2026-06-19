"""Optional Sentry error reporting (enabled when TIDALDLRU_SENTRY_DSN is set)."""

from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)


def init_sentry() -> None:
    dsn = os.environ.get("TIDALDLRU_SENTRY_DSN", "").strip()
    if not dsn:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
    except ImportError:
        log.warning("sentry-sdk not installed; skipping Sentry init")
        return

    traces = float(os.environ.get("TIDALDLRU_SENTRY_TRACES_SAMPLE_RATE", "0.1"))
    sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get("TIDALDLRU_ENV", "development"),
        release=os.environ.get("TIDALDLRU_RELEASE", "flacaud@0.1.0"),
        integrations=[
            FastApiIntegration(),
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
        ],
        traces_sample_rate=traces,
        send_default_pii=False,
    )
    log.info("Sentry initialized")
