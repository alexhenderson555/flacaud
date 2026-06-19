"""Initial schema — user, library, playlists, sets, activation codes.

Revision ID: 001_initial
Revises:
Create Date: 2026-06-10

Brownfield installs: existing DBs created via create_all() are stamped to head
on startup (see database.run_migrations) instead of re-running CREATE TABLE.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("username", sa.String(), nullable=True),
        sa.Column("hashed_password", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("telegram_id", sa.Integer(), nullable=True),
        sa.Column("first_name", sa.String(), nullable=True),
        sa.Column("plan", sa.String(), nullable=False, server_default="free"),
        sa.Column("subscription_expires_at", sa.DateTime(), nullable=True),
        sa.Column("downloads_today", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_downloads", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("quota_reset_at", sa.DateTime(), nullable=True),
        sa.Column("karaoke_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("dj_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_email"), "user", ["email"], unique=True)
    op.create_index(op.f("ix_user_username"), "user", ["username"], unique=True)
    op.create_index(op.f("ix_user_telegram_id"), "user", ["telegram_id"], unique=True)

    op.create_table(
        "savedtrack",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("provider_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("artists_json", sa.String(), nullable=False),
        sa.Column("artist_ids_json", sa.String(), nullable=True),
        sa.Column("album_id", sa.String(), nullable=True),
        sa.Column("cover_url", sa.String(), nullable=True),
        sa.Column("duration", sa.Integer(), nullable=True),
        sa.Column("album", sa.String(), nullable=True),
        sa.Column("release_date", sa.String(length=16), nullable=True),
        sa.Column("quality", sa.String(), nullable=True),
        sa.Column("bpm", sa.Integer(), nullable=True),
        sa.Column("camelot_key", sa.String(length=8), nullable=True),
        sa.Column("musical_key", sa.String(length=24), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("added_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "playlist",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("tracks_json", sa.String(), nullable=False, server_default="[]"),
        sa.Column("share_token", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_playlist_share_token"), "playlist", ["share_token"], unique=True)

    op.create_table(
        "savedset",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False, server_default="DJ set"),
        sa.Column("track_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tracks_json", sa.String(), nullable=False, server_default="[]"),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("saved_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("share_token", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_savedset_user_id"), "savedset", ["user_id"], unique=False)
    op.create_index(op.f("ix_savedset_share_token"), "savedset", ["share_token"], unique=True)

    op.create_table(
        "activationcode",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("plan", sa.String(), nullable=False, server_default="pro"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("redeemed_at", sa.DateTime(), nullable=True),
        sa.Column("redeemed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("note", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["redeemed_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_activationcode_code"), "activationcode", ["code"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_activationcode_code"), table_name="activationcode")
    op.drop_table("activationcode")
    op.drop_index(op.f("ix_savedset_share_token"), table_name="savedset")
    op.drop_index(op.f("ix_savedset_user_id"), table_name="savedset")
    op.drop_table("savedset")
    op.drop_index(op.f("ix_playlist_share_token"), table_name="playlist")
    op.drop_table("playlist")
    op.drop_table("savedtrack")
    op.drop_index(op.f("ix_user_telegram_id"), table_name="user")
    op.drop_index(op.f("ix_user_username"), table_name="user")
    op.drop_index(op.f("ix_user_email"), table_name="user")
    op.drop_table("user")
