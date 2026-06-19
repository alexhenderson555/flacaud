#!/usr/bin/env python3
"""Export core SQLite tables to SQL INSERTs for Postgres import.

Usage (on server with SQLite data file):

  python scripts/sqlite_to_postgres_export.py --sqlite /data/tidaldl.db --out /tmp/export.sql

Then review and load into Postgres (psql or pgloader). Does not stop the API;
run during maintenance window for consistency.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

_TABLES = (
    "user",
    "savedtrack",
    "playlist",
    "playlisttrack",
    "savedset",
    "transfermatchrule",
    "transferjob",
)


def _escape(val) -> str:
    if val is None:
        return "NULL"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    s = str(val).replace("'", "''")
    return f"'{s}'"


def export_sqlite(sqlite_path: Path, out_path: Path) -> int:
    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    lines: list[str] = ["BEGIN;", "SET session_replication_role = replica;"]
    for table in _TABLES:
        try:
            rows = conn.execute(f'SELECT * FROM "{table}"').fetchall()
        except sqlite3.OperationalError:
            continue
        if not rows:
            continue
        cols = rows[0].keys()
        col_list = ", ".join(f'"{c}"' for c in cols)
        for row in rows:
            vals = ", ".join(_escape(row[c]) for c in cols)
            lines.append(f'INSERT INTO "{table}" ({col_list}) VALUES ({vals}) ON CONFLICT DO NOTHING;')
    lines.append("SET session_replication_role = origin;")
    lines.append("COMMIT;")
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    meta = {"tables": _TABLES, "sqlite": str(sqlite_path), "lines": len(lines)}
    print(json.dumps(meta, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not args.sqlite.is_file():
        print(f"SQLite file not found: {args.sqlite}", file=sys.stderr)
        return 1
    return export_sqlite(args.sqlite, args.out)


if __name__ == "__main__":
    raise SystemExit(main())
