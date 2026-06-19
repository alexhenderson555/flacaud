"""Add subscription_cancel_at_period_end to user.

Revision ID: 004_sub_cancel
Revises: 003_transfer_rules
Create Date: 2026-06-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_sub_cancel"
down_revision: Union[str, None] = "003_transfer_rules"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"
    if is_sqlite:
        with op.batch_alter_table("user") as batch:
            batch.add_column(
                sa.Column("subscription_cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.false()),
            )
    else:
        op.add_column(
            "user",
            sa.Column("subscription_cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    op.drop_column("user", "subscription_cancel_at_period_end")
