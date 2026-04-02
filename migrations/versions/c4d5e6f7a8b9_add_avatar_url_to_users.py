"""add_avatar_url_to_users

Revision ID: c4d5e6f7a8b9
Revises: a3f2c1b4d5e6
Create Date: 2026-03-12 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op  # type: ignore
import sqlalchemy as sa  # type: ignore

revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "a3f2c1b4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'avatar_url'
            ) THEN
                ALTER TABLE users ADD COLUMN avatar_url varchar(500);
            END IF;
        END$$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'avatar_url'
            ) THEN
                ALTER TABLE users DROP COLUMN avatar_url;
            END IF;
        END$$;
        """
    )
