"""Copy data from SQLite to Postgres (schema must exist)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import MetaData, Table, create_engine, inspect, select, text

_TABLE_ORDER = (
    "user",
    "refreshsession",
    "activationcode",
    "savedtrack",
    "playlist",
    "playlisttrack",
    "transfermatchrule",
    "savedset",
)

_BOOL_COLS = {
    "user": {"karaoke_enabled", "dj_enabled", "email_verified", "subscription_cancel_at_period_end"},
    "refreshsession": {"revoked"},
    "transfermatchrule": {"block_match"},
}

_DEFAULTS = {
    "user": {"subscription_cancel_at_period_end": False},
}


def _coerce_row(table: str, row: dict) -> dict:
    out = dict(row)
    for col in _BOOL_COLS.get(table, ()):
        if col in out and out[col] is not None:
            out[col] = bool(out[col])
    for col, val in _DEFAULTS.get(table, {}).items():
        if col not in out or out[col] is None:
            out[col] = val
    return out


def _row_for_dst(table: str, row: dict, dst_table: Table) -> dict:
    out = _coerce_row(table, row)
    dst_cols = {c.name for c in dst_table.columns}
    return {col: out[col] for col in dst_cols if col in out}


def _reset_sequences(dst_engine, table_names: list[str]) -> None:
    if dst_engine.dialect.name != "postgresql":
        return
    insp = inspect(dst_engine)
    with dst_engine.begin() as conn:
        for table in table_names:
            if not insp.has_table(table):
                continue
            pk = insp.get_pk_constraint(table) or {}
            if pk.get("constrained_columns") != ["id"]:
                continue
            conn.execute(
                text(
                    f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM \"{table}\"), 1), true)"
                )
            )


def migrate(sqlite_path: Path, postgres_url: str, *, truncate: bool = False) -> dict:
    if not sqlite_path.is_file():
        raise FileNotFoundError(sqlite_path)

    src = create_engine(f"sqlite:///{sqlite_path.as_posix()}", connect_args={"check_same_thread": False})
    dst = create_engine(postgres_url)

    src_tables = set(inspect(src).get_table_names())
    counts: dict[str, int] = {}

    with dst.begin() as dconn:
        if truncate:
            for table in reversed(_TABLE_ORDER):
                if table in src_tables and inspect(dst).has_table(table):
                    dconn.execute(text(f'TRUNCATE TABLE "{table}" RESTART IDENTITY CASCADE'))

    for table in _TABLE_ORDER:
        if table not in src_tables:
            continue
        if not inspect(dst).has_table(table):
            print(f"skip {table}: missing on destination", file=sys.stderr)
            continue

        meta_src = MetaData()
        meta_dst = MetaData()
        src_table = Table(table, meta_src, autoload_with=src)
        dst_table = Table(table, meta_dst, autoload_with=dst)

        with src.connect() as sconn:
            rows = [dict(r) for r in sconn.execute(select(src_table)).mappings().all()]

        if not rows:
            counts[table] = 0
            continue

        payload = [_row_for_dst(table, r, dst_table) for r in rows]
        with dst.begin() as dconn:
            dconn.execute(dst_table.insert(), payload)
        counts[table] = len(payload)
        print(f"{table}: {len(payload)} rows")

    _reset_sequences(dst, list(_TABLE_ORDER))
    return counts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SQLite → Postgres data copy")
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--postgres-url", default="")
    parser.add_argument("--truncate", action="store_true")
    args = parser.parse_args(argv)

    import os

    pg_url = args.postgres_url or os.environ.get("DATABASE_URL", "")
    if not pg_url.startswith("postgresql"):
        print("Set --postgres-url or DATABASE_URL=postgresql+psycopg://...", file=sys.stderr)
        return 1

    migrate(args.sqlite, pg_url, truncate=args.truncate)
    print("Migration complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
