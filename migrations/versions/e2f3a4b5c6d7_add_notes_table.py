"""add notes table

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-03-12

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e2f3a4b5c6d7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "psychologist_profile_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("psychologist_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("content", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_notes_psychologist_profile_id", "notes", ["psychologist_profile_id"])


def downgrade() -> None:
    op.drop_index("ix_notes_psychologist_profile_id", table_name="notes")
    op.drop_table("notes")
