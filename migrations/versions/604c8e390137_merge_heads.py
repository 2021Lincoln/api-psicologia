"""merge_heads

Revision ID: 604c8e390137
Revises: a1b2c3d4e5f6, f3a4b5c6d7e8
Create Date: 2026-03-19 18:43:14.427668
"""

from typing import Sequence, Union

from alembic import op  # type: ignore
import sqlalchemy as sa  # type: ignore
from sqlmodel import SQLModel  # type: ignore

# revision identifiers, used by Alembic.
revision: str = '604c8e390137'
down_revision: Union[str, Sequence[str], None] = ('a1b2c3d4e5f6', 'f3a4b5c6d7e8')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
