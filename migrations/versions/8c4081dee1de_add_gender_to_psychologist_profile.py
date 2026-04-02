"""add_gender_to_psychologist_profile

Revision ID: 8c4081dee1de
Revises: 604c8e390137
Create Date: 2026-03-19 18:43:36.011041
"""

from typing import Sequence, Union

from alembic import op  # type: ignore
import sqlalchemy as sa  # type: ignore
from sqlmodel import SQLModel  # type: ignore

# revision identifiers, used by Alembic.
revision: str = '8c4081dee1de'
down_revision: Union[str, Sequence[str], None] = '604c8e390137'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('psychologist_profiles', sa.Column('gender', sa.String(length=1), nullable=True))


def downgrade() -> None:
    op.drop_column('psychologist_profiles', 'gender')
