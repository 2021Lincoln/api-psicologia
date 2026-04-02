"""add_reviews_table

Revision ID: d1e2f3a4b5c6
Revises: c4d5e6f7a8b9
Create Date: 2026-03-12 14:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op  # type: ignore

revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'reviews'
            ) THEN
                CREATE TABLE reviews (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id),
                    patient_id UUID NOT NULL REFERENCES users(id),
                    psychologist_profile_id UUID NOT NULL REFERENCES psychologist_profiles(id),
                    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
                    comment VARCHAR(1000),
                    created_at TIMESTAMP NOT NULL DEFAULT NOW()
                );
                CREATE INDEX ix_reviews_patient_id ON reviews(patient_id);
                CREATE INDEX ix_reviews_psychologist_profile_id ON reviews(psychologist_profile_id);
            END IF;
        END$$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS reviews;")
