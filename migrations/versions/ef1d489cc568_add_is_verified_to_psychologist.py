"""add is_verified_to_psychologist

Revision ID: ef1d489cc568
Revises: 
Create Date: 2026-03-12 00:52:42.612959
"""

from typing import Sequence, Union

from alembic import op  # type: ignore
import sqlalchemy as sa  # type: ignore
from sqlmodel import SQLModel  # type: ignore

# revision identifiers, used by Alembic.
revision: str = 'ef1d489cc568'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "psychologist_profiles",
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("psychologist_profiles", "is_verified", server_default=None)


def downgrade() -> None:
    op.drop_column("psychologist_profiles", "is_verified")
