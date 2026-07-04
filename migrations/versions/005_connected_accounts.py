"""Add connectedaccount table for per-user linked external music accounts.

Revision ID: 005_connected_accounts
Revises: 4bd92e6c393a
Create Date: 2026-07-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_connected_accounts"
down_revision: Union[str, None] = "4bd92e6c393a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "connectedaccount",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_account_id", sa.String(length=256), nullable=True),
        sa.Column("display_name", sa.String(length=256), nullable=True),
        sa.Column("access_token_enc", sa.String(), nullable=True),
        sa.Column("refresh_token_enc", sa.String(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("scopes", sa.String(), nullable=True),
        sa.Column("connected_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "provider", name="uq_connectedaccount_user_provider"),
    )
    op.create_index(
        "ix_connectedaccount_user_id", "connectedaccount", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_connectedaccount_user_id", table_name="connectedaccount")
    op.drop_table("connectedaccount")
