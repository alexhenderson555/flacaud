"""Transfer match rules + normalized playlist tracks.

Revision ID: 003_transfer_rules
Revises: 002_email_refresh
Create Date: 2026-06-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_transfer_rules"
down_revision: Union[str, None] = "002_email_refresh"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "transfermatchrule",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("source_platform", sa.String(length=32), nullable=False),
        sa.Column("source_title", sa.String(length=512), nullable=False),
        sa.Column("source_artist", sa.String(length=256), nullable=False, server_default=""),
        sa.Column("tidal_provider_id", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("block_match", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transfermatchrule_user_id", "transfermatchrule", ["user_id"])

    op.create_table(
        "playlisttrack",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("playlist_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("artists_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("album", sa.String(length=512), nullable=True),
        sa.Column("duration_s", sa.Integer(), nullable=True),
        sa.Column("cover_url", sa.String(length=2048), nullable=True),
        sa.Column("quality", sa.String(length=32), nullable=True),
        sa.ForeignKeyConstraint(["playlist_id"], ["playlist.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_playlisttrack_playlist_id", "playlisttrack", ["playlist_id"])


def downgrade() -> None:
    op.drop_index("ix_playlisttrack_playlist_id", table_name="playlisttrack")
    op.drop_table("playlisttrack")
    op.drop_index("ix_transfermatchrule_user_id", table_name="transfermatchrule")
    op.drop_table("transfermatchrule")
