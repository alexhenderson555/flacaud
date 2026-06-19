"""Async Library Transfer preview tasks (Redis-backed progress polling)."""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any, Callable, Optional

import redis
from pydantic import BaseModel, Field

from tidal_dl_ru.server.transfer_logging import log_resolve_summary
from tidal_dl_ru.server.settings import settings

logger = logging.getLogger(__name__)

TASK_TTL_S = 900
POLL_INTERVAL_S = 0.5

ProgressCallback = Callable[[str, int, int, int, str], None]


class TransferProgress(BaseModel):
    phase: str = "queued"  # queued | reading | matching | done | failed
    done: int = 0
    total: int = 0
    matched: int = 0
    percent: int = 0
    label: str = ""


class TransferTask(BaseModel):
    task_id: str
    url: str
    user_id: Optional[int] = None
    status: str = "running"  # running | done | failed
    progress: TransferProgress = Field(default_factory=TransferProgress)
    error: Optional[str] = None
    preview: Optional[dict[str, Any]] = None
    created_at: float = 0.0
    updated_at: float = 0.0


def _client() -> redis.Redis:
    r = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    r.ping()
    return r


def _key(task_id: str) -> str:
    return f"tidaldl:transfer:{task_id}"


def _import_result_key(task_id: str) -> str:
    return f"tidaldl:transfer:import:{task_id}"


def _percent(phase: str, done: int, total: int) -> int:
    if phase == "done":
        return 100
    if phase == "failed":
        return 0
    if phase == "reading":
        return 8 if total <= 0 else min(14, 8 + done)
    if phase == "matching" and total > 0:
        return min(99, 15 + int((done / total) * 84))
    return 5


def create_task(url: str, user_id: Optional[int] = None) -> str:
    task_id = uuid.uuid4().hex[:16]
    now = time.time()
    task = TransferTask(
        task_id=task_id,
        url=url.strip(),
        user_id=user_id,
        status="running",
        progress=TransferProgress(phase="queued", label="Starting…"),
        created_at=now,
        updated_at=now,
    )
    _save(task)
    return task_id


def load_task(task_id: str) -> Optional[TransferTask]:
    raw = _client().get(_key(task_id))
    if not raw:
        return None
    return TransferTask.model_validate(json.loads(raw))


def _save(task: TransferTask) -> None:
    task.updated_at = time.time()
    _client().set(_key(task.task_id), task.model_dump_json(), ex=TASK_TTL_S)


def update_progress(
    task_id: str,
    *,
    phase: str,
    done: int = 0,
    total: int = 0,
    matched: int = 0,
    label: str = "",
) -> None:
    task = load_task(task_id)
    if task is None or task.status != "running":
        return
    task.progress = TransferProgress(
        phase=phase,
        done=done,
        total=total,
        matched=matched,
        percent=_percent(phase, done, total),
        label=label,
    )
    _save(task)


def mark_done(task_id: str, preview: dict[str, Any]) -> None:
    task = load_task(task_id)
    if task is None:
        return
    task.status = "done"
    task.preview = preview
    task.progress = TransferProgress(
        phase="done",
        done=preview.get("total", 0),
        total=preview.get("source_total") or preview.get("total", 0),
        matched=preview.get("total", 0),
        percent=100,
        label="Done",
    )
    _save(task)


def mark_failed(task_id: str, error: str) -> None:
    task = load_task(task_id)
    if task is None:
        return
    task.status = "failed"
    task.error = error
    task.progress.phase = "failed"
    task.progress.percent = 0
    task.progress.label = error
    _save(task)


def make_progress_callback(task_id: str) -> ProgressCallback:
    def _cb(phase: str, done: int, total: int, matched: int, label: str) -> None:
        update_progress(task_id, phase=phase, done=done, total=total, matched=matched, label=label)

    return _cb


async def run_preview_task(task_id: str) -> None:
    from tidal_dl_ru.server.transfer_service import (
        _cache_set,
        _resolve_transfer_sync,
        preview_dict_from_result,
    )

    task = load_task(task_id)
    if task is None:
        return

    try:
        result = await asyncio.to_thread(
            _resolve_transfer_sync,
            task.url,
            make_progress_callback(task_id),
            task.user_id,
        )
        _cache_set(task.url, result)
        preview = preview_dict_from_result(result)
        log_resolve_summary(
            url=task.url,
            platform=result.source_platform,
            source_total=result.source_total,
            matched=result.matched_count,
            unmatched=result.unmatched_count,
            skipped_unavailable=result.skipped_unavailable,
            task_id=task_id,
        )
        mark_done(task_id, preview)
    except ProviderError as exc:
        mark_failed(task_id, str(exc))
    except Exception as exc:
        logger.exception("transfer preview task %s failed", task_id)
        mark_failed(task_id, f"{type(exc).__name__}: {exc}")


def load_import_result(task_id: str) -> Optional[dict[str, Any]]:
    raw = _client().get(_import_result_key(task_id.strip()))
    if not raw:
        return None
    return json.loads(raw)


def save_import_result(task_id: str, payload: dict[str, Any]) -> None:
    _client().set(_import_result_key(task_id.strip()), json.dumps(payload), ex=TASK_TTL_S)
