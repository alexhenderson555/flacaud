"""Lightweight process metrics (JSON + Prometheus text)."""

from __future__ import annotations

import time
from pathlib import Path
from threading import Lock

from tidal_dl_ru.server.path_metrics import normalize_path
from tidal_dl_ru.server.rec_cache import cache_stats
from tidal_dl_ru.server.settings import settings

_started = time.monotonic()
_lock = Lock()
_stream_errors: dict[str, int] = {
    "not_ready": 0,
    "failed": 0,
}
_disk_cleanup_last: dict | None = None
_health: dict[str, int] = {"ok": 0, "db": 0, "redis": 0}
_http_requests: dict[tuple[str, str, str], int] = {}
_client_errors: dict[str, int] = {}
_tidal_pool: dict[str, int] = {"total": 0, "active": 0, "healthy": 0}

# Prometheus default-style buckets (seconds). Matches prometheus_client's
# DEFAULT_BUCKETS so histogram_quantile() behaves as interviewers expect.
_DURATION_BUCKETS: tuple[float, ...] = (
    0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0,
)
_http_durations: dict[tuple[str, str], dict] = {}


def record_stream_error(kind: str) -> None:
    """Increment stream error counter (not_ready | failed)."""
    with _lock:
        _stream_errors[kind] = _stream_errors.get(kind, 0) + 1


def record_disk_cleanup(stats: dict) -> None:
    global _disk_cleanup_last
    with _lock:
        _disk_cleanup_last = {**stats, "at": time.time()}


def record_health(*, ok: bool, db_ok: bool, redis_ok: bool) -> None:
    with _lock:
        _health["ok"] = 1 if ok else 0
        _health["db"] = 1 if db_ok else 0
        _health["redis"] = 1 if redis_ok else 0


def record_http_request(
    method: str, path: str, status: int, duration_seconds: float | None = None
) -> None:
    route = normalize_path(path)
    status_class = f"{int(status // 100)}xx"
    key = (method.upper(), route, status_class)
    with _lock:
        _http_requests[key] = _http_requests.get(key, 0) + 1
        if duration_seconds is not None:
            dkey = (method.upper(), route)
            entry = _http_durations.setdefault(
                dkey, {"buckets": [0] * len(_DURATION_BUCKETS), "sum": 0.0, "count": 0}
            )
            entry["sum"] += duration_seconds
            entry["count"] += 1
            for i, bound in enumerate(_DURATION_BUCKETS):
                if duration_seconds <= bound:
                    entry["buckets"][i] += 1
                    break


def record_client_error(component: str) -> None:
    kind = (component or "unknown").strip()[:64] or "unknown"
    with _lock:
        _client_errors[kind] = _client_errors.get(kind, 0) + 1


def refresh_tidal_pool_metrics() -> None:
    try:
        from tidal_dl_ru.providers.tidal import pool as tidal_pool

        counts = tidal_pool.pool_size()
        active = int(counts.get("active", 0))
        total = int(counts.get("total", 0))
        with _lock:
            _tidal_pool["total"] = total
            _tidal_pool["active"] = active
            _tidal_pool["healthy"] = 1 if active >= 1 else 0
    except Exception:
        with _lock:
            _tidal_pool["total"] = 0
            _tidal_pool["active"] = 0
            _tidal_pool["healthy"] = 0


def _dir_bytes(path: Path) -> int:
    if not path.is_dir():
        return 0
    total = 0
    for child in path.rglob("*"):
        if child.is_file():
            try:
                total += child.stat().st_size
            except OSError:
                pass
    return total


def _disk_usage() -> dict:
    jobs_bytes = _dir_bytes(settings.jobs_dir)
    cache_bytes = _dir_bytes(settings.stream_cache_dir)
    return {
        "jobs_bytes": jobs_bytes,
        "stream_cache_bytes": cache_bytes,
        "stream_cache_cap_bytes": settings.stream_cache_max_bytes,
    }


def collect_metrics() -> dict:
    refresh_tidal_pool_metrics()
    with _lock:
        stream = dict(_stream_errors)
        cleanup = dict(_disk_cleanup_last) if _disk_cleanup_last else None
        health = dict(_health)
        tidal = dict(_tidal_pool)
        client_errors = dict(_client_errors)
        http_total = sum(_http_requests.values())
    return {
        "uptime_sec": round(time.monotonic() - _started, 1),
        "health": health,
        "recommendations_cache": cache_stats(),
        "stream_errors": stream,
        "client_errors": client_errors,
        "http_requests_total": http_total,
        "tidal_pool": tidal,
        "disk": _disk_usage(),
        "last_disk_cleanup": cleanup,
    }


def collect_prometheus_metrics() -> str:
    refresh_tidal_pool_metrics()
    data = collect_metrics()
    lines = [
        "# HELP flacaud_uptime_seconds Process uptime",
        "# TYPE flacaud_uptime_seconds gauge",
        f"flacaud_uptime_seconds {data['uptime_sec']}",
        "# HELP flacaud_health_ok Health check aggregate (1=ok)",
        "# TYPE flacaud_health_ok gauge",
        f"flacaud_health_ok {data['health']['ok']}",
        "# HELP flacaud_health_db_ok Database reachable",
        "# TYPE flacaud_health_db_ok gauge",
        f"flacaud_health_db_ok {data['health']['db']}",
        "# HELP flacaud_health_redis_ok Redis reachable",
        "# TYPE flacaud_health_redis_ok gauge",
        f"flacaud_health_redis_ok {data['health']['redis']}",
        "# HELP flacaud_stream_errors_total Stream errors by kind",
        "# TYPE flacaud_stream_errors_total counter",
    ]
    for kind, count in data["stream_errors"].items():
        lines.append(f'flacaud_stream_errors_total{{kind="{kind}"}} {count}')
    lines.append("# HELP flacaud_client_errors_total Browser/client errors by component")
    lines.append("# TYPE flacaud_client_errors_total counter")
    for component, count in data["client_errors"].items():
        lines.append(
            f'flacaud_client_errors_total{{component="{component}"}} {count}'
        )
    tidal = data["tidal_pool"]
    lines.extend(
        [
            "# HELP flacaud_tidal_pool_accounts Tidal pool accounts by status",
            "# TYPE flacaud_tidal_pool_accounts gauge",
            f'flacaud_tidal_pool_accounts{{status="total"}} {tidal["total"]}',
            f'flacaud_tidal_pool_accounts{{status="active"}} {tidal["active"]}',
            "# HELP flacaud_tidal_pool_healthy At least one active Tidal account",
            "# TYPE flacaud_tidal_pool_healthy gauge",
            f"flacaud_tidal_pool_healthy {tidal['healthy']}",
        ]
    )
    disk = data["disk"]
    lines.extend(
        [
            "# HELP flacaud_jobs_bytes Jobs volume usage",
            "# TYPE flacaud_jobs_bytes gauge",
            f"flacaud_jobs_bytes {disk['jobs_bytes']}",
            "# HELP flacaud_stream_cache_bytes Stream cache usage",
            "# TYPE flacaud_stream_cache_bytes gauge",
            f"flacaud_stream_cache_bytes {disk['stream_cache_bytes']}",
        ]
    )
    cap = disk.get("stream_cache_cap_bytes") or 1
    ratio = disk["stream_cache_bytes"] / cap
    lines.extend(
        [
            "# HELP flacaud_disk_used_ratio Stream cache vs cap ratio",
            "# TYPE flacaud_disk_used_ratio gauge",
            f"flacaud_disk_used_ratio {ratio:.6f}",
            "# HELP flacaud_http_requests_total HTTP requests by method, route and status class",
            "# TYPE flacaud_http_requests_total counter",
        ]
    )
    with _lock:
        http_items = list(_http_requests.items())
        duration_items = list(_http_durations.items())
    for (method, route, status_class), count in http_items:
        safe_route = route.replace('"', '\\"')
        lines.append(
            f'flacaud_http_requests_total{{method="{method}",route="{safe_route}",status_class="{status_class}"}} {count}'
        )
    lines.append("# HELP flacaud_http_request_duration_seconds HTTP request duration")
    lines.append("# TYPE flacaud_http_request_duration_seconds histogram")
    for (method, route), entry in duration_items:
        safe_route = route.replace('"', '\\"')
        cumulative = 0
        for bound, bucket_count in zip(_DURATION_BUCKETS, entry["buckets"]):
            cumulative += bucket_count
            lines.append(
                f'flacaud_http_request_duration_seconds_bucket{{method="{method}",route="{safe_route}",le="{bound}"}} {cumulative}'
            )
        lines.append(
            f'flacaud_http_request_duration_seconds_bucket{{method="{method}",route="{safe_route}",le="+Inf"}} {entry["count"]}'
        )
        lines.append(
            f'flacaud_http_request_duration_seconds_sum{{method="{method}",route="{safe_route}"}} {entry["sum"]:.6f}'
        )
        lines.append(
            f'flacaud_http_request_duration_seconds_count{{method="{method}",route="{safe_route}"}} {entry["count"]}'
        )
    return "\n".join(lines) + "\n"
