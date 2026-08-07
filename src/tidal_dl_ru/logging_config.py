"""Central logging setup for API, worker, and bot."""

from __future__ import annotations

import json
import logging
import os
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
user_id_var: ContextVar[str] = ContextVar("user_id", default="-")
username_var: ContextVar[str] = ContextVar("username", default="-")
service_var: ContextVar[str] = ContextVar("service", default="app")

_configured = False


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        record.user_id = user_id_var.get()
        record.username = username_var.get()
        record.service = service_var.get()
        return True


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "service": getattr(record, "service", "app"),
            "request_id": getattr(record, "request_id", "-"),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key in (
            "method",
            "path",
            "query",
            "status",
            "duration_ms",
            "client_ip",
            "user",
            "user_id",
            "username",
            "auth",
            "user_agent",
            "event",
            "component",
            "url",
            "stack",
            "error_message",
            "position",
            "match_score",
            "search_query",
            "candidate_count",
            "matched",
            "source",
            "tidal",
            "source_platform",
            "source_total",
            "matched_count",
            "unmatched_count",
            "skipped_unavailable",
            "task_id",
            "added_to_library",
            "already_in_library",
            "playlist_id",
            "total_tracks",
        ):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(service: str = "api") -> None:
    global _configured
    if _configured:
        service_var.set(service)
        return
    _apply_logging_config(service)
    _configured = True


def reapply_logging_config() -> None:
    """Force-redo the logging setup, bypassing the once-only guard.

    Alembic's generated migrations/env.py calls ``logging.config.fileConfig``
    on every `alembic upgrade`/`stamp` run -- including the ones
    create_db_and_tables() triggers on every app startup, not just the
    standalone `alembic` CLI. Even with disable_existing_loggers=False (which
    stops it from silently disabling every other logger), fileConfig still
    applies alembic.ini's own [logger_root] section, replacing root's level
    and handlers with alembic's plain, unstructured ones. Call this right
    after any Alembic command to restore our own setup.
    """
    _apply_logging_config(service_var.get())


def _apply_logging_config(service: str) -> None:
    level_name = os.environ.get("TIDALDLRU_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    log_format = os.environ.get("TIDALDLRU_LOG_FORMAT", "text").lower()

    service_var.set(service)
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(level)

    handler = logging.StreamHandler(sys.stderr)
    handler.addFilter(RequestContextFilter())
    if log_format == "json":
        handler.setFormatter(JsonLogFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s [%(service)s] [%(request_id)s] %(name)s: %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
    root.addHandler(handler)

    log_file = os.environ.get("TIDALDLRU_LOG_FILE")
    if log_file:
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.addFilter(RequestContextFilter())
        file_handler.setFormatter(handler.formatter)
        root.addHandler(file_handler)

    # RequestLoggingMiddleware already emits a structured JSON line per request
    # (tidal_dl_ru.access, with duration_ms/request_id/etc.) -- uvicorn's own
    # built-in access log duplicated every request as a second, plain-text
    # (non-JSON) line, doubling log volume and breaking Loki's `| json` parser
    # on that second line. WARNING keeps uvicorn.access visible for anything
    # actually unusual, just not the routine per-request line.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    if os.environ.get("TIDALDLRU_DEBUG_VERBOSE", "").strip().lower() not in ("1", "true", "yes"):
        for noisy in (
            "tidal_dl_ru.core.lyrics",
            "tidal_dl_ru.server.recommendations",
            "tidal_dl_ru.core.set_analyzer",
            "tidal_dl_ru.core.recognize",
        ):
            logging.getLogger(noisy).setLevel(logging.INFO)

    # The access logger must never inherit a stricter level than root -- explicit
    # NOTSET (rather than relying on the logging module's fresh-logger default)
    # guards against any future accidental `setLevel()` on this specific logger
    # silently swallowing every per-request INFO line with no visible error.
    access_logger = logging.getLogger("tidal_dl_ru.access")
    access_logger.setLevel(logging.NOTSET)
    access_logger.propagate = True

    root.info(
        "logging_configured level=%s format=%s handlers=%d access_logger_effective_level=%s",
        level_name,
        log_format,
        len(root.handlers),
        logging.getLevelName(access_logger.getEffectiveLevel()),
    )
