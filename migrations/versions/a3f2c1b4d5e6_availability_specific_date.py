"""availability_specific_date

Replace week_day integer column with specific_date date column in availabilities table.

Revision ID: a3f2c1b4d5e6
Revises: 76da55f5acd5
Create Date: 2026-03-12 10:00:00.000000
"""

from typing import Sequence, Union

from alembic import op  # type: ignore
import sqlalchemy as sa  # type: ignore

# revision identifiers, used by Alembic.
revision: str = "a3f2c1b4d5e6"
down_revision: Union[str, Sequence[str], None] = "76da55f5acd5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the old week_day column (if it exists)
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'availabilities' AND column_name = 'week_day'
            ) THEN
                ALTER TABLE availabilities DROP COLUMN week_day;
            END IF;
        END$$;
        """
    )

    # Add specific_date column (if it doesn't already exist)
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'availabilities' AND column_name = 'specific_date'
            ) THEN
                ALTER TABLE availabilities ADD COLUMN specific_date date NOT NULL DEFAULT CURRENT_DATE;
                ALTER TABLE availabilities ALTER COLUMN specific_date DROP DEFAULT;
            END IF;
        END$$;
        """
    )


def downgrade() -> None:
    # Re-add week_day and remove specific_date
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'availabilities' AND column_name = 'week_day'
            ) THEN
                ALTER TABLE availabilities ADD COLUMN week_day integer NOT NULL DEFAULT 0;
                ALTER TABLE availabilities ALTER COLUMN week_day DROP DEFAULT;
            END IF;
        END$$;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'availabilities' AND column_name = 'specific_date'
            ) THEN
                ALTER TABLE availabilities DROP COLUMN specific_date;
            END IF;
        END$$;
        """
    )
