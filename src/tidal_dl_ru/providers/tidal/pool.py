"""SQLite-backed pool of Tidal accounts.

Each account stores an encrypted refresh_token. We derive a fresh access token
on every acquire (cheap — Tidal allows arbitrary refreshes). Pool is used by
the server / workers; CLI single-account flow (tokens.json) still works
independently when the pool is empty.
"""

from __future__ import annotations

import base64
import contextlib
import os
import threading
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import (
    DateTime,
    Engine,
    ForeignKey,  # noqa: F401 — reserved for future user→account mapping
    Integer,
    String,
    create_engine,
    select,
    update,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    sessionmaker,
)

from tidal_dl_ru.config import POOL_DB_FILE, POOL_KEY_FILE, ensure_dirs
from tidal_dl_ru.providers.tidal.auth import AuthError
from tidal_dl_ru.providers.tidal.auth import refresh_token as refresh_tidal_token
from tidal_dl_ru.providers.tidal.models import TokenSet


class PoolError(Exception):
    pass


class NoAccountAvailable(PoolError):
    pass


# --- crypto -----------------------------------------------------------------


def _load_or_create_key() -> bytes:
    """Read Fernet key from env or ~/.config/.../pool.key. Generate if missing."""
    env_key = os.environ.get("TIDALDLRU_POOL_KEY")
    if env_key:
        return env_key.encode()
    ensure_dirs()
    if POOL_KEY_FILE.exists():
        return POOL_KEY_FILE.read_bytes().strip()
    key = Fernet.generate_key()
    POOL_KEY_FILE.write_bytes(key)
    try:
        os.chmod(POOL_KEY_FILE, 0o600)
    except OSError:
        pass
    return key


def _fernet() -> Fernet:
    return Fernet(_load_or_create_key())


def _encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def _decrypt(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as e:
        raise PoolError(
            "Cannot decrypt refresh_token. Pool key mismatch — set "
            "TIDALDLRU_POOL_KEY or restore pool.key file."
        ) from e


# --- ORM --------------------------------------------------------------------


class Base(DeclarativeBase):
    pass


class TidalAccount(Base):
    __tablename__ = "tidal_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(64), unique=True)
    refresh_token_enc: Mapped[str] = mapped_column(String(2048))
    country_code: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    daily_quota: Mapped[int] = mapped_column(Integer, default=100)
    downloads_today: Mapped[int] = mapped_column(Integer, default=0)
    total_downloads: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active|exhausted|banned
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    banned_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    quota_reset_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    @property
    def refresh_token(self) -> str:
        return _decrypt(self.refresh_token_enc)


# --- engine / session -------------------------------------------------------


_engine: Optional[Engine] = None
_SessionLocal: Optional[sessionmaker[Session]] = None



_engine_lock = threading.Lock()

def _get_engine() -> Engine:
    global _engine, _SessionLocal
    with _engine_lock:
        if _engine is None:
            ensure_dirs()
            _engine = create_engine(
                f"sqlite:///{POOL_DB_FILE}", connect_args={"check_same_thread": False}
            )
            Base.metadata.create_all(_engine)
            _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


@contextlib.contextmanager
def session():
    _get_engine()
    assert _SessionLocal is not None
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- rate-limit cooldown (in-memory; per API worker process) ----------------

_cooldown_lock = threading.Lock()
_cooldown_until: dict[int, float] = {}
DEFAULT_RATE_LIMIT_COOLDOWN_SEC = 45.0


def report_rate_limited(
    account_id: int,
    cooldown_sec: float = DEFAULT_RATE_LIMIT_COOLDOWN_SEC,
) -> None:
    """Backoff this pool account after Tidal 429 (do not ban)."""
    with _cooldown_lock:
        _cooldown_until[account_id] = time.time() + cooldown_sec
    report_failure(account_id, 429)


def _is_on_cooldown(account_id: int) -> bool:
    with _cooldown_lock:
        until = _cooldown_until.get(account_id, 0.0)
    return until > time.time()


def clear_cooldowns_for_tests() -> None:
    with _cooldown_lock:
        _cooldown_until.clear()


# --- pool operations --------------------------------------------------------


def add_account(
    label: str,
    refresh_token: str,
    *,
    country_code: Optional[str] = None,
    user_id: Optional[int] = None,
    daily_quota: int = 100,
) -> TidalAccount:
    """Add a fresh account. `refresh_token` is encrypted at rest."""
    with session() as s:
        acc = TidalAccount(
            label=label,
            refresh_token_enc=_encrypt(refresh_token),
            country_code=country_code,
            user_id=user_id,
            daily_quota=daily_quota,
        )
        s.add(acc)
        s.commit()
        s.refresh(acc)
        return acc


def list_accounts() -> list[TidalAccount]:
    with session() as s:
        return list(s.execute(select(TidalAccount).order_by(TidalAccount.id)).scalars())


def get_account(account_id: int) -> Optional[TidalAccount]:
    with session() as s:
        return s.get(TidalAccount, account_id)


def remove_account(account_id: int) -> bool:
    with session() as s:
        acc = s.get(TidalAccount, account_id)
        if acc is None:
            return False
        s.delete(acc)
        s.commit()
        return True


def acquire(
    http: Optional[httpx.Client] = None,
    *,
    exclude_ids: frozenset[int] | None = None,
) -> tuple[TidalAccount, TokenSet]:
    """Pick the least-recently-used active account under quota, refresh its token.

    Returns the account + a fresh TokenSet. The caller passes the TokenSet to
    TidalClient and reports back via report_success / report_failure.
    """
    now = datetime.now(timezone.utc)
    skip = exclude_ids or frozenset()
    with session() as s:
        stmt = (
            select(TidalAccount)
            .where(TidalAccount.status == "active")
            .where(TidalAccount.downloads_today < TidalAccount.daily_quota)
            .order_by(TidalAccount.last_used_at.asc().nullsfirst())
            .limit(32)
        )
        candidates = list(s.execute(stmt).scalars())
        acc = None
        for candidate in candidates:
            if candidate.id in skip:
                continue
            if _is_on_cooldown(candidate.id):
                continue
            acc = candidate
            break
        if acc is None:
            raise NoAccountAvailable(
                "No active Tidal accounts with remaining quota. "
                "Add accounts via `tidal-dl-ru pool add` or reset quotas."
            )
        # Reserve immediately to avoid races (single-process today, but cheap insurance).
        s.execute(
            update(TidalAccount)
            .where(TidalAccount.id == acc.id)
            .values(last_used_at=now)
        )
        s.commit()
        s.refresh(acc)

    own_http = http is None
    http = http or httpx.Client(timeout=30.0)
    try:
        tokens = refresh_tidal_token(http, acc.refresh_token)
    except AuthError:
        # Refresh genuinely failed (revoked/expired token) — ban the dead account
        # so it isn't handed out again. Transient/network errors raise other types
        # and are left untouched. Re-raise so the caller can pick another account.
        report_failure(acc.id, 401)
        raise
    finally:
        if own_http:
            http.close()

    # If the refresh response gave us a new refresh_token, persist it.
    if tokens.refresh_token != acc.refresh_token:
        with session() as s:
            s.execute(
                update(TidalAccount)
                .where(TidalAccount.id == acc.id)
                .values(refresh_token_enc=_encrypt(tokens.refresh_token))
            )
            s.commit()
    return acc, tokens


def report_success(account_id: int) -> None:
    with session() as s:
        s.execute(
            update(TidalAccount)
            .where(TidalAccount.id == account_id)
            .values(
                downloads_today=TidalAccount.downloads_today + 1,
                total_downloads=TidalAccount.total_downloads + 1,
            )
        )
        s.commit()


def report_failure(account_id: int, http_status: int) -> None:
    """Mark an account banned/exhausted based on the HTTP failure code."""
    now = datetime.now(timezone.utc)
    with session() as s:
        acc = s.get(TidalAccount, account_id)
        if acc is None:
            return
        if http_status in (401, 403):
            acc.status = "banned"
            acc.banned_at = now
        # 429 = rate limit — transient; do not ban the pool account.
        # 5xx → temporary; we don't disable the account
        s.commit()


def reset_daily_quotas() -> int:
    """Set downloads_today = 0 for all active accounts. Returns rows updated."""
    now = datetime.now(timezone.utc)
    with session() as s:
        result = s.execute(
            update(TidalAccount).values(downloads_today=0, quota_reset_at=now)
        )
        s.commit()
        return result.rowcount or 0


def revive(account_id: int) -> bool:
    """Move a banned/exhausted account back to active (after manual fix)."""
    with session() as s:
        acc = s.get(TidalAccount, account_id)
        if acc is None:
            return False
        acc.status = "active"
        acc.banned_at = None
        s.commit()
        return True


# --- bootstrap helpers ------------------------------------------------------


def import_tokens_json(label: str = "default") -> Optional[TidalAccount]:
    """One-shot migration: read the local tokens.json (from `login`) into the pool."""
    from tidal_dl_ru.providers.tidal.auth import load_tokens

    t = load_tokens()
    if t is None:
        return None
    return add_account(
        label=label,
        refresh_token=t.refresh_token,
        country_code=t.country_code,
        user_id=t.user_id,
    )


def pool_size() -> dict[str, int]:
    """Return counts by status — handy for monitoring."""
    counts = {"active": 0, "banned": 0, "exhausted": 0, "total": 0}
    for acc in list_accounts():
        counts["total"] += 1
        counts[acc.status] = counts.get(acc.status, 0) + 1
    return counts


def encode_pool_key(key: bytes) -> str:
    """Return a copy/pasteable string form of the pool key (for env)."""
    return base64.b64encode(base64.b64decode(key)).decode()
