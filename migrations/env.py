"""Alembic environment — uses SQLModel metadata from all registered tables."""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

import tidal_dl_ru.database.models  # noqa: F401 — register User, SavedTrack, …
import tidal_dl_ru.server.activation_codes  # noqa: F401 — ActivationCode

config = context.config

if config.config_file_name is not None:
    # disable_existing_loggers defaults to True, which silently disables every
    # logger our app already configured (including the access logger) the
    # instant migrations run -- this env.py executes on every app startup via
    # create_db_and_tables() -> run_migrations(), not just the standalone
    # `alembic` CLI, so it must not clobber a live process's logging setup.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = SQLModel.metadata


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    from pathlib import Path

    db_path = Path(
        os.environ.get(
            "TIDALDLRU_DB_PATH",
            str(Path.home() / ".local" / "share" / "tidal-dl-ru" / "flacaudio.db"),
        )
    )
    return f"sqlite:///{db_path.as_posix()}"


def run_migrations_offline() -> None:
    url = _database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
