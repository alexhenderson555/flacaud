"""remove tracks_json

Revision ID: 4bd92e6c393a
Revises: 004_sub_cancel
Create Date: 2026-06-18 01:08:20.494549

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4bd92e6c393a'
down_revision: Union[str, None] = '004_sub_cancel'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # We are dropping tracks_json from playlist, but not from savedset
    with op.batch_alter_table('playlist') as batch_op:
        batch_op.drop_column('tracks_json')


def downgrade() -> None:
    with op.batch_alter_table('playlist') as batch_op:
        batch_op.add_column(sa.Column('tracks_json', sa.String(), nullable=False, server_default='[]'))
