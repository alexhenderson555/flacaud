"""Entry point for the Telegram bot.

Run with:
    python -m tidal_dl_ru.bot.main

Requires env vars:
    TIDALDLRU_BOT_TOKEN  — Telegram bot token from @BotFather
    TIDALDLRU_API_BASE   — URL of the FastAPI backend (default: http://localhost:8000)
"""

from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties

from tidal_dl_ru.bot.api_client import APIClient
from tidal_dl_ru.bot.handlers import router
from tidal_dl_ru.bot.settings import bot_settings
from tidal_dl_ru.logging_config import configure_logging

configure_logging("bot")
log = logging.getLogger(__name__)


async def main() -> None:
    if not bot_settings.token or bot_settings.token == "1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789":
        log.error(
            "TIDALDLRU_BOT_TOKEN is not set or is a dummy token. "
            "Get a token from @BotFather and set the env var. "
            "Bot container will now sleep instead of crashing."
        )
        while True:
            await asyncio.sleep(3600)

    bot = Bot(
        token=bot_settings.token,
        default=DefaultBotProperties(parse_mode="HTML"),
    )
    dp = Dispatcher()
    dp.include_router(router)

    # Shared API client — injected into handlers via middleware.
    api = APIClient()

    @dp.update.outer_middleware()
    async def inject_api(handler, event, data):
        data["api"] = api
        return await handler(event, data)

    log.info("Bot starting (polling)...")
    log.info("API base: %s", bot_settings.api_base)

    try:
        await dp.start_polling(bot)
    finally:
        await api.close()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
