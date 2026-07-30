"""Add saved albums

Revision ID: f64d9350014e
Revises: 006_processed_payments
Create Date: 2026-07-24 13:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel

# revision identifiers, used by Alembic.
revision: str = '007_saved_albums'
down_revision: Union[str, None] = '006_processed_payments'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('savedalbum',
    sa.Column('provider_id', sa.String(length=64), nullable=False),
    sa.Column('title', sa.String(length=512), nullable=False),
    sa.Column('artists_json', sa.String(), nullable=False),
    sa.Column('cover_url', sa.String(length=512), nullable=True),
    sa.Column('release_date', sa.String(length=16), nullable=True),
    sa.Column('track_count', sa.Integer(), nullable=False),
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('saved_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('savedalbum', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_savedalbum_provider_id'), ['provider_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_savedalbum_user_id'), ['user_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('savedalbum', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_savedalbum_user_id'))
        batch_op.drop_index(batch_op.f('ix_savedalbum_provider_id'))
    op.drop_table('savedalbum')
