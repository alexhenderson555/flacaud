"""Worker subscription cron smoke tests."""

from unittest.mock import patch

import pytest

from tidal_dl_ru.server import worker as worker_mod


@pytest.mark.asyncio
async def test_subscription_expiry_notify_returns_sent():
    with patch("tidal_dl_ru.server.worker.notify_expiring_subscriptions", return_value=2):
        out = await worker_mod.subscription_expiry_notify({})
    assert out == {"sent": 2}


@pytest.mark.asyncio
async def test_subscription_expire_due_returns_count():
    with patch("tidal_dl_ru.server.worker.expire_due_subscriptions", return_value=1):
        out = await worker_mod.subscription_expire_due({})
    assert out == {"expired": 1}
