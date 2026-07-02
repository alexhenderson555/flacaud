"""Tidal per-track quality probe — shared by streaming and download."""

from __future__ import annotations

import time

from tidal_dl_ru.plan_limits import filter_qualities_for_player
from tidal_dl_ru.providers.tidal.manifest_fetch import fetch_playback_manifest
from tidal_dl_ru.providers.tidal.models import AudioQuality

_QUALITY_PROBE = (
    (AudioQuality.HI_RES_LOSSLESS, "HI_RES"),
    (AudioQuality.LOSSLESS, "LOSSLESS"),
    (AudioQuality.HIGH, "HIGH"),
)
_UI_QUALITY_ORDER = ("HIGH", "LOSSLESS", "HI_RES")
_FALLBACK_ORDER = ("HI_RES", "LOSSLESS", "HIGH")


def qname(q) -> str:
    return getattr(q, "name", str(q)).upper()


def actual_tier_rank(actual: str) -> int:
    a = (actual or "").upper()
    if "HI_RES" in a:
        return 4
    if "LOSSLESS" in a:
        return 3
    if a == "HIGH":
        return 2
    return 1


def ui_tier_rank(ui_q: str) -> int:
    return {"HIGH": 2, "LOSSLESS": 3, "HI_RES": 4}.get(ui_q, 0)


def actual_supports_ui_tier(actual: str, ui_q: str) -> bool:
    """Manifest at ui_q must deliver at least that tier (HI_RES needs hi-res audio)."""
    return actual_tier_rank(actual) >= ui_tier_rank(ui_q)


def catalog_ui_tiers(audio_q: str | None) -> tuple[list[str], str]:
    if not audio_q:
        return [], "HIGH"
    a = audio_q.upper()
    if "HI_RES" in a:
        return ["HIGH", "LOSSLESS", "HI_RES"], "HI_RES"
    if "LOSSLESS" in a:
        return ["HIGH", "LOSSLESS"], "LOSSLESS"
    return ["HIGH"], "HIGH"


def infer_available_from_actuals(available: list[str], actual: dict[str, str]) -> None:
    peak = max((ui_tier_rank(q) for q in available), default=0)
    if peak >= ui_tier_rank("HI_RES"):
        for ui_q in ("HI_RES", "LOSSLESS", "HIGH"):
            if ui_q not in available:
                available.append(ui_q)
    elif peak >= ui_tier_rank("LOSSLESS"):
        for ui_q in ("LOSSLESS", "HIGH"):
            if ui_q not in available:
                available.append(ui_q)


def _actual_quality_label(manifest, ui_q: str) -> str:
    """API quality string for a verified UI tier (metadata must not outrank codec proof)."""
    aq = qname(manifest.audio_quality)
    if not actual_supports_ui_tier(aq, ui_q):
        return ui_q
    if ui_tier_rank(ui_q) < actual_tier_rank(aq):
        return ui_q
    return aq


def merge_catalog_quality_hint(
    client,
    track_id: str,
    available: list[str],
    actual: dict[str, str],
) -> str | None:
    if client is None:
        return None
    try:
        meta_q = client.get_track(track_id).audio_quality
    except Exception:
        return None
    catalog_tiers, _ = catalog_ui_tiers(meta_q)
    for ui_q in catalog_tiers:
        # Catalog metadata often says LOSSLESS while API only serves AAC — trust manifests only.
        if ui_q in ("LOSSLESS", "HI_RES"):
            continue
        if ui_q not in available:
            available.append(ui_q)
        if ui_q not in actual and meta_q:
            actual[ui_q] = meta_q
    return meta_q


def expand_probe_available(
    available: list[str],
    actual: dict[str, str],
    max_quality: str,
) -> tuple[list[str], dict[str, str]]:
    tiers = set(available)
    if max_quality == "HI_RES" or "HI_RES" in tiers:
        tiers.update(("LOSSLESS", "HIGH"))
    elif max_quality == "LOSSLESS" or "LOSSLESS" in tiers:
        tiers.add("HIGH")

    expanded = [q for q in _UI_QUALITY_ORDER if q in tiers]
    actual_out = dict(actual)
    for ui_q in expanded:
        if ui_q in actual_out:
            continue
        for src in ("HI_RES", "LOSSLESS", "HIGH"):
            aq = actual_out.get(src)
            if aq and actual_supports_ui_tier(aq, ui_q):
                # Requesting a lower UI tier yields that tier's codec (HIGH = AAC
                # 320k), never the higher source quality — cap so actual["HIGH"]
                # can't claim hi-res/lossless and mis-drive the player badge.
                actual_out[ui_q] = aq if actual_tier_rank(aq) <= ui_tier_rank(ui_q) else ui_q
                break
    return expanded, actual_out


def _manifest_flac_hi_res(manifest) -> bool:
    sr = manifest.sample_rate or 0
    bd = manifest.bit_depth or 0
    return sr > 48000 or bd > 16


def manifest_delivers_ui_tier(manifest, ui_q: str) -> bool:
    """True when manifest delivers the UI tier (codec-checked; metadata alone is not enough)."""
    from tidal_dl_ru.providers.tidal.download import manifest_inspect

    try:
        info = manifest_inspect(manifest)
    except Exception:
        return False
    codecs = (info.get("codecs") or "").lower()
    aq = qname(manifest.audio_quality)

    if ui_q == "HIGH":
        return "mp4a" in codecs or "aac" in codecs or aq in ("HIGH", "LOW")

    if "flac" not in codecs:
        return False
    if ui_q == "HI_RES":
        return _manifest_flac_hi_res(manifest) or "HI_RES" in aq
    if ui_q == "LOSSLESS":
        return True
    return False


def manifest_ui_tiers(manifest) -> list[str]:
    """All UI tiers this manifest can deliver (HI_RES slot often returns 16-bit FLAC as LOSSLESS)."""
    return [ui_q for ui_q in _UI_QUALITY_ORDER if manifest_delivers_ui_tier(manifest, ui_q)]


def _record_manifest(
    manifest,
    available: list[str],
    downloadable: list[str],
    actual: dict[str, str],
    flac_manifest,
):
    delivered = manifest_ui_tiers(manifest)
    if not delivered:
        return flac_manifest
    for ui_q in delivered:
        if ui_q not in available:
            available.append(ui_q)
        if ui_q not in downloadable:
            downloadable.append(ui_q)
        if ui_q not in actual:
            actual[ui_q] = _actual_quality_label(manifest, ui_q)
    if flac_manifest is None:
        from tidal_dl_ru.providers.tidal.download import manifest_inspect

        try:
            info = manifest_inspect(manifest)
            if "flac" in (info.get("codecs") or "").lower():
                return manifest
        except Exception:
            pass
    return flac_manifest


def probe_tidal_qualities(client, track_id: str, *, manifest_client=None) -> dict:
    """Return available UI qualities and actual Tidal manifest quality per level.

    ``manifest_client`` (optional) fetches every probe manifest through a
    specific Tidal client; when omitted, fetches rotate through the shared
    account pool. ``client`` is only used for the (optional) catalog hint.
    """
    available: list[str] = []
    downloadable: list[str] = []
    actual: dict[str, str] = {}
    flac_manifest = None
    rate_limited = False

    hi_res = getattr(AudioQuality, "HI_RES_LOSSLESS", None)
    probe_order: list[AudioQuality] = []
    if hi_res is not None:
        probe_order.append(hi_res)
    probe_order.extend([AudioQuality.LOSSLESS, AudioQuality.HIGH])

    for enum_q in probe_order:
        if flac_manifest is not None and enum_q != hi_res:
            # FLAC confirmed via HI_RES slot — skip extra AAC-only manifest calls.
            break
        manifest, limited = fetch_playback_manifest(track_id, enum_q, client=manifest_client)
        if limited:
            rate_limited = True
        if manifest is None:
            continue
        flac_manifest = _record_manifest(
            manifest, available, downloadable, actual, flac_manifest,
        )

    if flac_manifest is None and rate_limited and hi_res is not None:
        time.sleep(0.8)
        manifest, limited = fetch_playback_manifest(track_id, hi_res, client=manifest_client)
        if limited:
            rate_limited = True
        if manifest is not None:
            flac_manifest = _record_manifest(
                manifest, available, downloadable, actual, flac_manifest,
            )

    probe_complete = flac_manifest is not None or not rate_limited
    infer_available_from_actuals(available, actual)
    catalog_meta_q = merge_catalog_quality_hint(client, track_id, available, actual)
    available.sort(key=lambda q: _UI_QUALITY_ORDER.index(q) if q in _UI_QUALITY_ORDER else 0)
    max_quality = "HIGH"
    for _, ui_q in _QUALITY_PROBE:
        if ui_q in available:
            max_quality = ui_q
            break
    ui_available = filter_qualities_for_player(available)
    ui_max = max_quality if max_quality != "LOW" else ui_available[-1]
    ui_actual = {k: v for k, v in actual.items() if k != "LOW"}
    ui_available, ui_actual = expand_probe_available(ui_available, ui_actual, ui_max)

    dl_tiers = set(downloadable)
    if ui_max == "HI_RES" or "HI_RES" in dl_tiers:
        dl_tiers.update(("LOSSLESS", "HIGH"))
    elif ui_max == "LOSSLESS" or "LOSSLESS" in dl_tiers:
        dl_tiers.add("HIGH")
    downloadable_out = [q for q in _UI_QUALITY_ORDER if q in dl_tiers]

    lossless: dict = {"available": False, "hires_only": False}
    if flac_manifest is not None:
        from tidal_dl_ru.providers.tidal.download import manifest_lossless_meta

        flac_sr, flac_bd = manifest_lossless_meta(flac_manifest)
        lossless = {
            "available": True,
            "hires_only": _manifest_flac_hi_res(flac_manifest),
            "sample_rate": flac_sr,
            "bit_depth": flac_bd,
        }
    elif probe_complete and catalog_meta_q:
        cat_tiers, _ = catalog_ui_tiers(catalog_meta_q)
        if "LOSSLESS" in cat_tiers or "HI_RES" in cat_tiers:
            lossless["catalog_only"] = True
    return {
        "available": ui_available,
        "downloadable": downloadable_out,
        "max_quality": ui_max,
        "actual": ui_actual,
        "lossless": lossless,
        "probe_complete": probe_complete,
        "rate_limited": rate_limited,
    }


def _download_tiers(probe: dict | list[str]) -> list[str]:
    if isinstance(probe, dict):
        tiers = probe.get("downloadable") or []
        if tiers:
            return tiers
        # Legacy probe cache: only tiers with verified manifest entries.
        actual = probe.get("actual") or {}
        return [
            q for q in _UI_QUALITY_ORDER
            if q in actual and actual_supports_ui_tier(actual[q], q)
        ]
    return list(probe)


def pick_download_ui_quality(wanted: str, probe: dict | list[str]) -> str:
    """Best UI tier ≤ wanted with a verified Tidal manifest (no catalog-only FLAC)."""
    tiers = _download_tiers(probe)
    wanted_u = (wanted or "HIGH").upper()
    if wanted_u == "LOW":
        wanted_u = "HIGH"
    if wanted_u in tiers:
        return wanted_u
    if wanted_u == "LOSSLESS" and "HI_RES" in tiers:
        return "HI_RES"
    if wanted_u not in _FALLBACK_ORDER:
        wanted_u = "HIGH"
    start = _FALLBACK_ORDER.index(wanted_u)
    for q in _FALLBACK_ORDER[start:]:
        if q in tiers:
            return q
    return tiers[-1] if tiers else "HIGH"


_UI_TO_ENUM = {
    "HIGH": AudioQuality.HIGH,
    "LOSSLESS": AudioQuality.LOSSLESS,
    "HI_RES": getattr(AudioQuality, "HI_RES_LOSSLESS", AudioQuality.LOSSLESS),
}


def ui_quality_to_enum(ui_q: str) -> AudioQuality:
    return _UI_TO_ENUM.get((ui_q or "HIGH").upper(), AudioQuality.HIGH)
