import logging

from tidal_dl_ru.logging_config import configure_logging, request_id_var


def test_configure_logging_idempotent():
    configure_logging("test")
    configure_logging("test")
    log = logging.getLogger("test.logging")
    request_id_var.set("abc123")
    log.info("hello", extra={"event": "test_event"})
    assert logging.getLogger().handlers
