"""Central logging setup for API, worker, and bot."""

from __future__ import annotations

import json
import logging
import os
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
service_var: ContextVar[str] = ContextVar("service", default="app")

_configured = False


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
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
        for key in ("method", "path", "status", "duration_ms", "client_ip", "user", "event"):
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

    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    _configured = True


def log_event(logger: logging.Logger, level: int, event: str, **fields) -> None:
    """Structured fields on a single log line (text or JSON)."""
    extra = {"event": event, **fields}
    logger.log(level, event, extra=extra)
