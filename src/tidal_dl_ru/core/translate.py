"""LRC lyrics translation via DeepL API.

Translates synced LRC lyrics line-by-line, preserving timestamps.
Produces a `.ru.lrc` sidecar with Russian translation.

Docs: https://developers.deepl.com/docs
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Optional

import httpx

DEEPL_API = os.environ.get(
    "TIDALDLRU_DEEPL_API",
    "https://api-free.deepl.com/v2",  # free tier by default
)
DEEPL_KEY = os.environ.get("TIDALDLRU_DEEPL_KEY", "")

# Matches LRC timestamp tags: [mm:ss.xx] or [mm:ss.xxx]
_TS_RE = re.compile(r"^(\[[\d:.]+\])\s*(.*)")

# Max lines per DeepL request (API limit is 50 texts per call).
_BATCH_SIZE = 50


class TranslationError(Exception):
    pass


def _parse_lrc(lrc_text: str) -> list[tuple[str, str]]:
    """Split LRC into (timestamp_tag, text) pairs.

    Lines without a timestamp (metadata like [ar:Artist]) are kept with
    empty text so they pass through unchanged.
    """
    lines: list[tuple[str, str]] = []
    for raw in lrc_text.splitlines():
        raw = raw.strip()
        if not raw:
            lines.append(("", ""))
            continue
        m = _TS_RE.match(raw)
        if m:
            lines.append((m.group(1), m.group(2)))
        else:
            # Metadata line like [ar:Artist] or [ti:Title] — keep as-is.
            lines.append((raw, ""))
    return lines


def _reassemble(pairs: list[tuple[str, str]]) -> str:
    """Reassemble (tag, text) pairs back into LRC format."""
    out: list[str] = []
    for tag, text in pairs:
        if not tag and not text:
            out.append("")
        elif not text:
            out.append(tag)
        else:
            out.append(f"{tag} {text}")
    return "\n".join(out)


async def translate_texts(
    texts: list[str],
    target_lang: str = "RU",
    source_lang: Optional[str] = None,
) -> list[str]:
    """Translate a batch of plain texts via DeepL. Returns translations in order."""
    if not DEEPL_KEY:
        raise TranslationError(
            "TIDALDLRU_DEEPL_KEY not set. Get a key at https://www.deepl.com/pro-api"
        )

    # Filter out empty strings — DeepL rejects them.
    index_map: list[int] = []
    non_empty: list[str] = []
    for i, t in enumerate(texts):
        if t.strip():
            index_map.append(i)
            non_empty.append(t)

    if not non_empty:
        return texts  # nothing to translate

    results = list(texts)  # copy — fill in translations

    # Batch in chunks of _BATCH_SIZE.
    async with httpx.AsyncClient(timeout=30.0) as client:
        for batch_start in range(0, len(non_empty), _BATCH_SIZE):
            batch = non_empty[batch_start : batch_start + _BATCH_SIZE]
            data: dict = {
                "text": batch,
                "target_lang": target_lang,
            }
            if source_lang:
                data["source_lang"] = source_lang

            try:
                resp = await client.post(
                    f"{DEEPL_API}/translate",
                    json=data,
                    headers={"Authorization": f"DeepL-Auth-Key {DEEPL_KEY}"},
                )
            except httpx.RequestError as exc:
                raise TranslationError(f"DeepL API network error: {exc}") from exc

            if resp.status_code != 200:
                raise TranslationError(
                    f"DeepL API error {resp.status_code}: {resp.text[:200]}"
                )

            translations = resp.json().get("translations", [])
            for j, tr in enumerate(translations):
                orig_idx = index_map[batch_start + j]
                results[orig_idx] = tr.get("text", texts[orig_idx])

    return results


async def translate_lrc(
    lrc_text: str,
    target_lang: str = "RU",
) -> str:
    """Translate an LRC file preserving timestamps. Returns translated LRC string."""
    pairs = _parse_lrc(lrc_text)

    # Collect only lyric lines (non-empty text after timestamp).
    lyric_indices: list[int] = []
    lyric_texts: list[str] = []
    for i, (tag, text) in enumerate(pairs):
        if tag and text and not tag.startswith("[ar:") and not tag.startswith("[ti:"):
            lyric_indices.append(i)
            lyric_texts.append(text)

    if not lyric_texts:
        return lrc_text  # nothing to translate

    translated = await translate_texts(lyric_texts, target_lang=target_lang)

    # Rebuild pairs with translated text.
    result = list(pairs)
    for idx, tr_text in zip(lyric_indices, translated):
        tag = result[idx][0]
        result[idx] = (tag, tr_text)

    return _reassemble(result)


async def translate_lrc_to_file(
    lrc_text: str,
    audio_path: Path,
    target_lang: str = "RU",
) -> Optional[Path]:
    """Translate LRC and write a `.ru.lrc` sidecar. Returns sidecar path or None."""
    try:
        translated = await translate_lrc(lrc_text, target_lang=target_lang)
    except TranslationError:
        return None

    # Build sidecar path: song.flac → song.ru.lrc
    stem = audio_path.stem
    sidecar = audio_path.parent / f"{stem}.ru.lrc"
    sidecar.write_text(translated, encoding="utf-8")
    return sidecar
