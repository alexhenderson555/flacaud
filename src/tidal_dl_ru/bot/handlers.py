"""Telegram bot handlers — aiogram 3."""

from __future__ import annotations

import re

from aiogram import Bot, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import BufferedInputFile, Message

from tidal_dl_ru.bot.api_client import APIClient
from tidal_dl_ru.bot.settings import bot_settings
from tidal_dl_ru.bot.users import (
    PLAN_LIMITS,
    PLAN_PRICES,
    Plan,
    check_and_increment,
    get_or_create,
    record_downloads,
    toggle_dj,
    toggle_karaoke,
)
from tidal_dl_ru.server.payments import create_payment

router = Router()

# Matches URLs from any supported provider.
_URL_RE = re.compile(
    r"https?://(?:"
    r"(?:www\.)?tidal\.com|"
    r"music\.youtube\.com|(?:www\.)?youtube\.com|youtu\.be|"
    r"(?:www\.)?soundcloud\.com|"
    r"[\w-]+\.bandcamp\.com"
    r")/\S+",
    re.IGNORECASE,
)

HELP_TEXT = (
    "🎵 <b>tidal-dl-ru</b> — скачивай музыку в FLAC\n\n"
    "Просто отправь ссылку на трек или альбом:\n"
    "• Tidal\n"
    "• YouTube Music\n"
    "• SoundCloud\n"
    "• Bandcamp\n\n"
    "Команды:\n"
    "/start — приветствие\n"
    "/help — эта справка\n"
    "/me — твой аккаунт и лимиты\n"
    "/subscribe — тарифы\n"
    "/karaoke — вкл/выкл перевод текста на русский\n"
    "/dj — вкл/выкл BPM + тональность\n"
    "/split <ссылка> — разделить трек на вокал и музыку\n"
    "/analyze <ссылка> — распознать треки в DJ-сете\n"
    "\n🎤 Отправь голосовое — распознаю и скачаю трек!"
)

PLAN_EMOJI = {
    Plan.FREE: "🆓",
    Plan.BASIC: "⭐",
    Plan.PRO: "💎",
    Plan.LIFETIME: "👑",
}


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    # Register user on first contact.
    user = message.from_user
    if user:
        get_or_create(user.id, username=user.username, first_name=user.first_name)

    await message.answer(
        "👋 Привет! Отправь мне ссылку на трек или альбом, "
        "и я скачаю его в FLAC.\n\n"
        "Поддерживаю: Tidal, YouTube Music, SoundCloud, Bandcamp.\n\n"
        "Напиши /help для подробностей.",
        parse_mode="HTML",
    )


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    await message.answer(HELP_TEXT, parse_mode="HTML")


@router.message(Command("me"))
async def cmd_me(message: Message) -> None:
    tg_user = message.from_user
    if not tg_user:
        return
    user = get_or_create(tg_user.id, username=tg_user.username, first_name=tg_user.first_name)
    plan = user.effective_plan
    emoji = PLAN_EMOJI.get(plan, "")

    karaoke_status = "✅" if user.karaoke_enabled else "❌"
    dj_status = "✅" if user.dj_enabled else "❌"

    text = (
        f"👤 <b>{tg_user.first_name or tg_user.username or 'User'}</b>\n\n"
        f"Тариф: {emoji} <b>{plan.value.upper()}</b>\n"
        f"Скачано сегодня: <b>{user.downloads_today}/{user.daily_limit}</b>\n"
        f"Всего скачано: <b>{user.total_downloads}</b>\n"
        f"Караоке: {karaoke_status}  DJ: {dj_status}\n"
    )
    if user.subscription_expires_at and plan not in (Plan.FREE, Plan.LIFETIME):
        text += f"Подписка до: <b>{user.subscription_expires_at.strftime('%d.%m.%Y')}</b>\n"

    if plan == Plan.FREE:
        text += "\n💡 /subscribe — увеличить лимит"

    await message.answer(text, parse_mode="HTML")


@router.message(Command("subscribe"))
async def cmd_subscribe(message: Message) -> None:
    lines = ["📋 <b>Тарифы</b>\n"]
    for plan, price in PLAN_PRICES.items():
        emoji = PLAN_EMOJI.get(plan, "")
        limit = PLAN_LIMITS[plan]
        lines.append(f"{emoji} <b>{plan.value.upper()}</b> — {price}")
        lines.append(f"   {limit} треков/день, FLAC, все провайдеры\n")

    lines.append(
        f"🆓 <b>FREE</b> — бесплатно\n"
        f"   {PLAN_LIMITS[Plan.FREE]} трека/день\n"
    )
    lines.append(
        "💳 Для оплаты: /pay basic или /pay pro или /pay lifetime"
    )
    await message.answer("\n".join(lines), parse_mode="HTML")


@router.message(Command("karaoke"))
async def cmd_karaoke(message: Message) -> None:
    """Toggle Russian lyrics translation."""
    tg_user = message.from_user
    if not tg_user:
        return
    get_or_create(tg_user.id, username=tg_user.username, first_name=tg_user.first_name)
    enabled = toggle_karaoke(tg_user.id)
    if enabled:
        await message.answer(
            "🎤 Караоке-режим <b>включён</b>!\n"
            "Тексты будут переводиться на русский (.ru.lrc).",
            parse_mode="HTML",
        )
    else:
        await message.answer(
            "🎤 Караоке-режим <b>выключен</b>.",
            parse_mode="HTML",
        )


@router.message(Command("dj"))
async def cmd_dj(message: Message) -> None:
    """Toggle BPM + key detection."""
    tg_user = message.from_user
    if not tg_user:
        return
    get_or_create(tg_user.id, username=tg_user.username, first_name=tg_user.first_name)
    enabled = toggle_dj(tg_user.id)
    if enabled:
        await message.answer(
            "🎧 DJ-режим <b>включён</b>!\n"
            "BPM и тональность будут записаны в теги.",
            parse_mode="HTML",
        )
    else:
        await message.answer(
            "🎧 DJ-режим <b>выключен</b>.",
            parse_mode="HTML",
        )


@router.message(Command("pay"))
async def cmd_pay(message: Message) -> None:
    """Create a YooKassa payment link."""
    tg_user = message.from_user
    if not tg_user:
        return

    args = (message.text or "").split()
    if len(args) < 2:
        await message.answer(
            "Укажи тариф: /pay basic, /pay pro или /pay lifetime",
            parse_mode="HTML",
        )
        return

    plan_name = args[1].lower()
    plan_map = {"basic": Plan.BASIC, "pro": Plan.PRO, "lifetime": Plan.LIFETIME}
    plan = plan_map.get(plan_name)
    if plan is None:
        await message.answer(
            "Неизвестный тариф. Доступны: basic, pro, lifetime",
        )
        return

    get_or_create(tg_user.id, username=tg_user.username, first_name=tg_user.first_name)
    url = create_payment(tg_user.id, plan)
    if url is None:
        await message.answer(
            "⚠️ Оплата временно недоступна. Попробуйте позже.",
        )
        return

    price = PLAN_PRICES.get(plan, "")
    await message.answer(
        f"💳 Оплата <b>{plan.value.upper()}</b> ({price}):\n\n"
        f"<a href=\"{url}\">Перейти к оплате</a>\n\n"
        f"После оплаты подписка активируется автоматически.",
        parse_mode="HTML",
    )

@router.message(Command("sync"))
async def cmd_sync(message: Message, api: APIClient) -> None:
    """Sync a playlist from any service to Tidal FLAC."""
    tg_user = message.from_user
    if not tg_user:
        return

    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("Использование: /sync <ссылка на плейлист>")
        return

    url = parts[1]
    url_match = _URL_RE.search(url)
    if not url_match:
        await message.answer("Неверный URL.")
        return
    url = url_match.group(0)

    user_rec = get_or_create(tg_user.id, username=tg_user.username, first_name=tg_user.first_name)
    allowed, user = check_and_increment(tg_user.id)
    if not allowed:
        await message.answer("⛔ Лимит исчерпан. Попробуйте позже.")
        return

    status_msg = await message.answer("🔄 Анализирую плейлист и ищу треки в Tidal...")

    try:
        job = await api.create_job(
            url,
            karaoke=user_rec.karaoke_enabled,
            dj_analyze=user_rec.dj_enabled,
            match_tidal=True,
            user_id=user_rec.id,
        )
    except Exception as e:
        await status_msg.edit_text(f"❌ Ошибка: {e}")
        return

    await status_msg.edit_text(f"⬇️ Скачиваю... (job: <code>{job.job_id}</code>)", parse_mode="HTML")

    try:
        result = await api.wait_for_job(job.job_id, user_id=user_rec.id)
    except TimeoutError:
        await status_msg.edit_text("⏰ Таймаут — скачивание заняло слишком долго.")
        return

    if result.status == "failed":
        await status_msg.edit_text("❌ Не удалось скачать.")
        return

    sent = 0
    for track in result.tracks:
        if track.status != "done" or not track.file_token:
            continue
        try:
            content, filename = await api.download_file(track.file_token)
            if len(content) > bot_settings.tg_max_file_size:
                continue
            doc = BufferedInputFile(content, filename=filename)
            await message.answer_document(doc, caption=f"🎵 {track.title}")
            sent += 1
        except Exception:
            pass

    if sent > 1:
        record_downloads(tg_user.id, sent)

    msg = f"✅ Скачано {sent} треков."
    if len(result.tracks) > 1:
        msg += f"\n\n📦 Скачать плейлист целиком (ZIP):\nhttp://151.243.177.88/api/jobs/{job.job_id}/zip"
    await status_msg.edit_text(msg)


@router.message(Command("split"))
async def cmd_split(message: Message, api: APIClient) -> None:
    """Split a track into vocals and instrumentals."""
    tg_user = message.from_user
    if not tg_user:
        return

    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("Использование: /split <ссылка на трек>")
        return

    url = parts[1]
    url_match = _URL_RE.search(url)
    if not url_match:
        await message.answer("Неверный URL.")
        return
    url = url_match.group(0)

    user_rec = get_or_create(tg_user.id, username=tg_user.username, first_name=tg_user.first_name)
    allowed, user = check_and_increment(tg_user.id)
    if not allowed:
        await message.answer("⛔ Лимит исчерпан. Попробуйте позже.")
        return

    status_msg = await message.answer("✂️ Разделяю трек на вокал и музыку (это может занять пару минут)...")

    try:
        job = await api.create_job(
            url,
            karaoke=False,
            dj_analyze=False,
            match_tidal=False,
            split=True,
            user_id=user_rec.id,
        )
    except Exception as e:
        await status_msg.edit_text(f"❌ Ошибка: {e}")
        return

    try:
        result = await api.wait_for_job(job.job_id, user_id=user_rec.id)
    except TimeoutError:
        await status_msg.edit_text("⏰ Таймаут — операция заняла слишком долго.")
        return

    if result.status == "failed":
        await status_msg.edit_text("❌ Не удалось разделить трек.")
        return

    sent = 0
    for track in result.tracks:
        if track.status != "done" or not track.file_token:
            continue
        try:
            content, filename = await api.download_file(track.file_token)
            if len(content) > bot_settings.tg_max_file_size:
                continue
            doc = BufferedInputFile(content, filename=filename)
            await message.answer_document(doc, caption=f"🎵 {track.title}")
            sent += 1
        except Exception:
            pass

    msg = "✅ Готово!"
    await status_msg.edit_text(msg)


@router.message(Command("analyze"))
async def cmd_analyze(message: Message, api: APIClient) -> None:
    """Analyze a DJ set / mix and find all tracks in it."""
    tg_user = message.from_user
    if not tg_user:
        return

    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("Использование: /analyze <ссылка на YouTube/SoundCloud микс>")
        return

    url = parts[1]
    url_match = _URL_RE.search(url)
    if not url_match:
        await message.answer("Неверный URL.")
        return
    url = url_match.group(0)

    user_rec = get_or_create(tg_user.id, username=tg_user.username, first_name=tg_user.first_name)
    allowed, user = check_and_increment(tg_user.id)
    if not allowed:
        await message.answer("⛔ Лимит исчерпан. Попробуйте позже.")
        return

    status_msg = await message.answer("🔍 Начинаю анализ сета. Это займет время...")

    try:
        job = await api.create_job(url, job_type="analyze_set", user_id=user_rec.id)
    except Exception as e:
        await status_msg.edit_text(f"❌ Ошибка: {e}")
        return

    try:
        result = await api.wait_for_job(job.job_id, user_id=user_rec.id)
    except TimeoutError:
        await status_msg.edit_text("⏰ Таймаут — анализ занял слишком долго.")
        return

    if result.status == "failed":
        await status_msg.edit_text("❌ Не удалось проанализировать сет.")
        return

    if not result.set_tracks:
        await status_msg.edit_text("🤷 Ни одного трека не распознано.")
        return

    lines = ["📋 <b>Распознанные треки:</b>\n"]
    for t in result.set_tracks:
        lines.append(f"⏱ {t.timestamp} - <b>{t.artist}</b> — {t.title}")
        if t.matched_track:
            lines.append(f"   ✅ Найден в Tidal! (<code>/sync {t.matched_track.source_url}</code>)")

    text = "\n".join(lines)
    if len(text) > 4000:
        text = text[:3900] + "\n... (список обрезан)"
    await status_msg.edit_text(text, parse_mode="HTML")


@router.message(F.text.regexp(_URL_RE))
async def handle_url(message: Message, api: APIClient) -> None:
    """User sent a URL — check limits, create a download job, send the result."""
    tg_user = message.from_user
    if not tg_user:
        return

    url_match = _URL_RE.search(message.text or "")
    if not url_match:
        return
    url = url_match.group(0)

    # Register / check limits.
    user_rec = get_or_create(tg_user.id, username=tg_user.username, first_name=tg_user.first_name)
    allowed, user = check_and_increment(tg_user.id)
    if not allowed:
        plan = user.effective_plan
        await message.answer(
            f"⛔ Лимит исчерпан: <b>{user.downloads_today}/{user.daily_limit}</b> "
            f"треков сегодня (тариф {plan.value.upper()}).\n\n"
            f"💡 /subscribe — увеличить лимит",
            parse_mode="HTML",
        )
        return

    status_msg = await message.answer("⏳ Ставлю в очередь...")

    try:
        job = await api.create_job(
            url,
            karaoke=user_rec.karaoke_enabled,
            dj_analyze=user_rec.dj_enabled,
            user_id=user_rec.id,
        )
    except Exception as e:
        await status_msg.edit_text(f"❌ Ошибка: {e}")
        return

    await status_msg.edit_text(
        f"⬇️ Скачиваю... (job: <code>{job.job_id}</code>)",
        parse_mode="HTML",
    )

    # Wait for completion.
    try:
        result = await api.wait_for_job(job.job_id, user_id=user_rec.id)
    except TimeoutError:
        await status_msg.edit_text("⏰ Таймаут — скачивание заняло слишком долго.")
        return

    if result.status == "failed":
        error = ""
        if result.tracks:
            error = result.tracks[0].error or ""
        await status_msg.edit_text(f"❌ Не удалось скачать.\n{error}")
        return

    # Send each completed track.
    sent = 0
    for track in result.tracks:
        if track.status != "done" or not track.file_token:
            continue
        try:
            content, filename = await api.download_file(track.file_token)
            if len(content) > bot_settings.tg_max_file_size:
                await message.answer(
                    f"⚠️ <b>{track.title}</b> слишком большой для Telegram "
                    f"({len(content) // 1024 // 1024} МБ > 50 МБ).",
                    parse_mode="HTML",
                )
                continue
            doc = BufferedInputFile(content, filename=filename)
            await message.answer_document(doc, caption=f"🎵 {track.title}")
            sent += 1
        except Exception as e:
            await message.answer(f"⚠️ Ошибка при отправке {track.title}: {e}")

    # Record extra downloads for albums (first one already counted).
    if sent > 1:
        record_downloads(tg_user.id, sent)

    # Summary.
    total = len(result.tracks)
    remaining = user.daily_limit - user.downloads_today - max(0, sent - 1)
    remaining = max(0, remaining)

    msg = f"✅ Готово! {sent} трек(ов) отправлено. Осталось сегодня: {remaining}"
    if sent != total:
        msg = f"⚠️ Отправлено {sent}/{total}. (Возможно, файлы слишком большие). Осталось сегодня: {remaining}"

    if total > 1:
        msg += f"\n\n📦 Скачать весь альбом/плейлист (ZIP):\nhttp://151.243.177.88/api/jobs/{job.job_id}/zip"

    await status_msg.edit_text(msg)

@router.message(F.voice | F.audio)
async def handle_voice(message: Message, api: APIClient, bot: Bot) -> None:
    """Voice/audio message → AudD recognition → Tidal download."""
    from tidal_dl_ru.core.recognize import RecognitionError, recognize_audio

    tg_user = message.from_user
    if not tg_user:
        return

    user_rec = get_or_create(tg_user.id, username=tg_user.username, first_name=tg_user.first_name)
    allowed, user = check_and_increment(tg_user.id)
    if not allowed:
        await message.answer(
            f"⛔ Лимит исчерпан: {user.downloads_today}/{user.daily_limit} треков сегодня.\n"
            f"💡 /subscribe — увеличить лимит",
            parse_mode="HTML",
        )
        return

    status_msg = await message.answer("🎤 Распознаю...")

    # Download voice/audio from Telegram.
    file_obj = message.voice or message.audio
    if not file_obj:
        return
    try:
        file = await bot.get_file(file_obj.file_id)
        if not file.file_path:
            await status_msg.edit_text("❌ Не удалось получить файл.")
            return
        from io import BytesIO

        buf = BytesIO()
        await bot.download_file(file.file_path, buf)
        audio_bytes = buf.getvalue()
    except Exception as e:
        await status_msg.edit_text(f"❌ Ошибка загрузки: {e}")
        return

    # Recognize via AudD.
    try:
        result = await recognize_audio(audio_bytes)
    except RecognitionError as e:
        await status_msg.edit_text(f"❌ {e}")
        return

    if result is None:
        await status_msg.edit_text("🤷 Не удалось распознать трек. Попробуй более длинный фрагмент.")
        return

    await status_msg.edit_text(
        f"🎵 Распознано: <b>{result.artist} — {result.title}</b>\n"
        f"⬇️ Ищу на Tidal...",
        parse_mode="HTML",
    )

    # Search on Tidal via the API — use search query.
    query = f"{result.artist} {result.title}"
    try:
        job = await api.create_job(
            f"tidal-search://{query}",  # Special URL scheme handled below.
            user_id=user_rec.id,
        )
    except Exception:
        # Fallback: search via regular Tidal URL won't work.
        # Instead, use the search endpoint directly.
        pass

    # Direct approach: search Tidal, get first result URL, then download.
    import httpx as _httpx

    try:
        async with _httpx.AsyncClient(timeout=15.0) as http:
            search_resp = await http.post(
                f"{bot_settings.api_base}/api/search",
                json={"query": query, "provider": "tidal", "limit": 1},
            )
            search_resp.raise_for_status()
            tracks = search_resp.json().get("tracks", [])
    except Exception as e:
        await status_msg.edit_text(f"❌ Ошибка поиска: {e}")
        return

    if not tracks:
        await status_msg.edit_text(
            f"🎵 Распознано: <b>{result.artist} — {result.title}</b>\n"
            f"❌ Не найдено на Tidal.",
            parse_mode="HTML",
        )
        return

    track = tracks[0]
    source_url = track.get("source_url", "")
    if not source_url:
        await status_msg.edit_text("❌ Нет URL для скачивания.")
        return

    await status_msg.edit_text(
        f"🎵 <b>{result.artist} — {result.title}</b>\n⬇️ Скачиваю FLAC...",
        parse_mode="HTML",
    )

    # Create download job.
    try:
        job = await api.create_job(source_url, user_id=user_rec.id)
        final = await api.wait_for_job(job.job_id, user_id=user_rec.id)
    except Exception as e:
        await status_msg.edit_text(f"❌ Ошибка скачивания: {e}")
        return

    if final.status == "failed":
        await status_msg.edit_text("❌ Не удалось скачать трек.")
        return

    # Send file.
    for t in final.tracks:
        if t.status == "done" and t.file_token:
            try:
                content, filename = await api.download_file(t.file_token)
                if len(content) > bot_settings.tg_max_file_size:
                    await message.answer("⚠️ Файл слишком большой для Telegram.")
                    continue
                doc = BufferedInputFile(content, filename=filename)
                await message.answer_document(doc, caption=f"🎵 {result.artist} — {result.title}")
                await status_msg.edit_text(
                    f"✅ {result.artist} — {result.title} — отправлено!"
                )
                return
            except Exception as e:
                await status_msg.edit_text(f"❌ Ошибка отправки: {e}")
                return

    await status_msg.edit_text("❌ Не удалось отправить файл.")


@router.message(F.text)
async def handle_text(message: Message) -> None:
    """Fallback for non-URL text."""
    await message.answer(
        "🔗 Отправь ссылку на трек или альбом, "
        "или отправь голосовое сообщение для распознавания.\n"
        "Поддерживаю: Tidal, YouTube Music, SoundCloud, Bandcamp.",
    )
