"""Search query correction — keyboard layout + spelling (Google-style, lightweight)."""

from __future__ import annotations

import json
from pathlib import Path

_EN = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./"
_RU = "ёйцукенгшщзхъфывапролджэячсмитьбю."
_EN_SHIFT = '~QWERTYUIOP{}ASDFGHJKL:"ZXCVBNM<>?'
_RU_SHIFT = 'Ё!"№;%:?*()_+ЙЦУКЕНГШЩЗХЪ/ФЫВАПРОЛДЖЭ,ЯЧСМИТЬБЮ.'
_EN_VOWELS = set("aeiouyAEIOUY")
_RU_VOWELS = set("аеёиоуыэюяАЕЁИОУЫЭЮЯ")

_VOCAB_PATH = Path(__file__).resolve().parents[3] / "shared" / "music_vocab.json"


def _load_music_vocab() -> tuple[str, ...]:
    try:
        raw = json.loads(_VOCAB_PATH.read_text(encoding="utf-8"))
        if isinstance(raw, list):
            return tuple(str(x).strip() for x in raw if str(x).strip())
    except Exception:
        pass
    return ("Major Lazer", "Radiohead", "Daft Punk")


MUSIC_VOCAB: tuple[str, ...] = _load_music_vocab()


def _swap_layout(text: str, src: str, dst: str, src_s: str, dst_s: str) -> str:
    out: list[str] = []
    for ch in text:
        i = src.find(ch)
        if i >= 0:
            out.append(dst[i] if i < len(dst) else ch)
            continue
        i = src_s.find(ch)
        if i >= 0:
            out.append(dst_s[i] if i < len(dst_s) else ch)
            continue
        out.append(ch)
    return "".join(out)


def fix_keyboard_layout(query: str) -> str:
    if not query or not query.strip():
        return query
    has_cyr = any("\u0400" <= c <= "\u04FF" or c in "ёЁ" for c in query)
    has_lat = any("a" <= c.lower() <= "z" for c in query)
    if has_cyr and has_lat:
        return query
    if has_cyr:
        return _swap_layout(query, _RU, _EN, _RU_SHIFT, _EN_SHIFT)
    if has_lat:
        return _swap_layout(query, _EN, _RU, _EN_SHIFT, _RU_SHIFT)
    return query


def _looks_like_wrong_layout(query: str) -> bool:
    has_cyr = any("\u0400" <= c <= "\u04FF" or c in "ёЁ" for c in query)
    has_lat = any("a" <= c.lower() <= "z" for c in query)
    if has_cyr and has_lat:
        return False
    if has_lat and not has_cyr:
        if any(c in _EN_VOWELS for c in query):
            return False
        return len(query) >= 4
    if has_cyr and not has_lat:
        # EN typed on RU keyboard often contains я/у (e.g. дфяук → lazer).
        if _cyrillic_token_meant_english(query):
            return True
        if any(c in _RU_VOWELS for c in query):
            return False
        return len(query) >= 4
    return False


def _cyrillic_token_meant_english(token: str) -> bool:
    """Cyrillic chars that map to a Latin word with an English vowel (major, lazer)."""
    if len(token) < 3:
        return False
    if any("a" <= c.lower() <= "z" for c in token):
        return False
    fixed = _swap_layout(token, _RU, _EN, _RU_SHIFT, _EN_SHIFT)
    if fixed == token:
        return False
    if not fixed.replace("-", "").replace("'", "").isascii():
        return False
    if not all(ch.isalpha() or ch in "-'" for ch in fixed):
        return False
    return any(c in _EN_VOWELS for c in fixed)


def _fix_layout_token(token: str) -> str | None:
    if len(token) < 3 or not _looks_like_wrong_layout(token):
        return None
    fixed = fix_keyboard_layout(token)
    if fixed == token:
        return None
    orig_cyr = any("\u0400" <= c <= "\u04FF" or c in "ёЁ" for c in token)
    fixed_cyr = any("\u0400" <= c <= "\u04FF" or c in "ёЁ" for c in fixed)
    if orig_cyr != fixed_cyr:
        return fixed
    return None


def suggest_layout(query: str) -> str | None:
    raw = query.strip()
    if not raw:
        return None
    if " " in raw:
        parts = raw.split()
        out: list[str] = []
        changed = False
        for part in parts:
            fixed = _fix_layout_token(part)
            if fixed:
                out.append(fixed)
                changed = True
            else:
                out.append(part)
        if changed:
            return " ".join(out)
        return None
    return _fix_layout_token(raw)


def _damerau_levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    la, lb = len(a), len(b)
    if la == 0:
        return lb
    if lb == 0:
        return la
    d = [[0] * (lb + 1) for _ in range(la + 1)]
    for i in range(la + 1):
        d[i][0] = i
    for j in range(lb + 1):
        d[0][j] = j
    for i in range(1, la + 1):
        for j in range(1, lb + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + cost)
    return d[la][lb]


def _max_edit(n: int) -> int:
    if n <= 4:
        return 1
    if n <= 8:
        return 2
    return 3


def suggest_spelling(query: str, vocabulary: tuple[str, ...] | None = None) -> str | None:
    raw = query.strip()
    if len(raw) < 4:
        return None
    q = raw.lower()
    vocab = vocabulary or MUSIC_VOCAB
    best: str | None = None
    best_dist = 99
    for term in vocab:
        t = term.lower()
        if abs(len(t) - len(q)) > 4:
            continue
        dist = _damerau_levenshtein(q, t)
        allowed = _max_edit(len(q))
        if dist <= allowed and dist < best_dist:
            best_dist = dist
            best = term
    if not best or best.lower() == q:
        return None
    return best


def suggest_mangled_suffix(query: str, vocabulary: tuple[str, ...] | None = None) -> str | None:
    """Query = correct prefix + accidental suffix (e.g. shimzadfgfdgd → Shimza)."""
    raw = query.strip()
    if len(raw) < 5 or " " in raw:
        return None
    q = raw.lower()
    vocab = vocabulary or MUSIC_VOCAB
    best: str | None = None
    best_len = 0
    for term in vocab:
        t = term.lower()
        if len(t) < 3 or len(q) <= len(t):
            continue
        head = q[: len(t)]
        dist = _damerau_levenshtein(head, t)
        if dist <= _max_edit(len(t)) and len(q) > len(t) and len(t) > best_len:
            best_len = len(t)
            best = term
    return best


def suggest_trim_suffix_search(
    query: str,
    search_fn,
    *,
    min_prefix: int = 4,
    max_extra_calls: int = 10,
) -> str | None:
    """Shortest prefix of query that returns search hits (suffix junk)."""
    q = query.strip()
    if len(q) < 6 or " " in q:
        return None
    if not all(c.isalnum() or c in "-_'." for c in q):
        return None
    calls = 0
    for n in range(min_prefix, len(q) + 1):
        if calls >= max_extra_calls:
            break
        part = q[:n]
        calls += 1
        try:
            tracks, _ = search_fn(part, 1, 0)
        except Exception:
            continue
        if tracks:
            return part
    return None


def suggest_search_query(query: str) -> tuple[str | None, str | None]:
    """Return (suggested_text, kind) where kind is layout | typo."""
    layout = suggest_layout(query)
    if layout:
        vocab_hit = suggest_spelling(layout)
        return (vocab_hit or layout), "layout"
    typo = suggest_spelling(query)
    if typo:
        return typo, "typo"
    mangled = suggest_mangled_suffix(query)
    if mangled:
        return mangled, "typo"
    return None, None
