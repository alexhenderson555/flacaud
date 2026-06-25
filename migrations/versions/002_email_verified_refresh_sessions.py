"""Add email_verified and refresh session table.

Revision ID: 002_email_refresh
Revises: 001_initial
Create Date: 2026-06-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_email_refresh"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    if is_sqlite:
        with op.batch_alter_table("user") as batch:
            batch.add_column(
                sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.true()),
            )
    else:
        op.add_column(
            "user",
            sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.true()),
        )

    # Existing accounts are grandfathered as verified.
    op.execute(sa.text('UPDATE "user" SET email_verified = true'))

    op.create_table(
        "refreshsession",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_refreshsession_token_hash"), "refreshsession", ["token_hash"], unique=True)
    op.create_index(op.f("ix_refreshsession_user_id"), "refreshsession", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_refreshsession_user_id"), table_name="refreshsession")
    op.drop_index(op.f("ix_refreshsession_token_hash"), table_name="refreshsession")
    op.drop_table("refreshsession")
    op.drop_column("user", "email_verified")
