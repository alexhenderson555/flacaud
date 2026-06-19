from __future__ import annotations

from functools import lru_cache
from typing import Optional

from tidal_dl_ru.providers.base import Provider
from tidal_dl_ru.providers.tidal import TidalProvider


@lru_cache(maxsize=1)
def all_providers() -> list[Provider]:
    return [TidalProvider()]


def find_provider(url: str) -> Optional[Provider]:
    p = all_providers()[0]
    return p if p.supports(url) else None


def get_provider_by_name(name: str) -> Optional[Provider]:
    if (name or "").strip().lower() != "tidal":
        return None
    return all_providers()[0]
