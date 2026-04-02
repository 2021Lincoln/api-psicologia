"""add sex to users

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-03-12

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f3a4b5c6d7e8"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("sex", sa.String(10), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "sex")
