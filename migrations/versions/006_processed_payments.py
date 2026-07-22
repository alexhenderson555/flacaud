"""Add processedpayment table for YooKassa webhook idempotency.

Revision ID: 006_processed_payments
Revises: 005_connected_accounts
Create Date: 2026-07-22
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_processed_payments"
down_revision: Union[str, None] = "005_connected_accounts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "processedpayment",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("payment_id", sa.String(), nullable=False),
        sa.Column("processed_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("payment_id", name="uq_processedpayment_payment_id"),
    )
    op.create_index(
        "ix_processedpayment_payment_id", "processedpayment", ["payment_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_processedpayment_payment_id", table_name="processedpayment")
    op.drop_table("processedpayment")
