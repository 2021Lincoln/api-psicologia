"""add_accent_color_to_psychologist_profile

Revision ID: 12a009c68c4e
Revises: 8c4081dee1de
Create Date: 2026-03-19 18:51:08.430328
"""

from typing import Sequence, Union

from alembic import op  # type: ignore
import sqlalchemy as sa  # type: ignore
from sqlmodel import SQLModel  # type: ignore

# revision identifiers, used by Alembic.
revision: str = '12a009c68c4e'
down_revision: Union[str, Sequence[str], None] = '8c4081dee1de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('psychologist_profiles', sa.Column('accent_color', sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column('psychologist_profiles', 'accent_color')
