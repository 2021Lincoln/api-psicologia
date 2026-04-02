"""add session_recordings, session_transcripts, session_summaries

Revision ID: a1b2c3d4e5f6
Revises: e2f3a4b5c6d7
Create Date: 2026-03-18

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a1b2c3d4e5f6"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── session_recordings ────────────────────────────────────────────────────
    op.create_table(
        "session_recordings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "appointment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("appointments.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("daily_recording_id", sa.String(200), nullable=True),
        sa.Column("recording_url", sa.String(1000), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("error_message", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_session_recordings_appointment_id",
        "session_recordings",
        ["appointment_id"],
        unique=True,
    )

    # ── session_transcripts ───────────────────────────────────────────────────
    op.create_table(
        "session_transcripts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "appointment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("appointments.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("full_text", sa.Text(), nullable=True),
        sa.Column("segments", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("language", sa.String(10), nullable=False, server_default="pt-BR"),
        sa.Column("word_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="processing",
        ),
        sa.Column("transcribed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_session_transcripts_appointment_id",
        "session_transcripts",
        ["appointment_id"],
        unique=True,
    )

    # ── session_summaries ─────────────────────────────────────────────────────
    op.create_table(
        "session_summaries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "appointment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("appointments.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("chief_complaint", sa.Text(), nullable=True),
        sa.Column("mental_status", sa.Text(), nullable=True),
        sa.Column("diagnostic_hypotheses", sa.Text(), nullable=True),
        sa.Column("interventions", sa.Text(), nullable=True),
        sa.Column("session_content", sa.Text(), nullable=True),
        sa.Column("patient_evolution", sa.Text(), nullable=True),
        sa.Column("therapeutic_plan", sa.Text(), nullable=True),
        sa.Column("next_steps", sa.Text(), nullable=True),
        sa.Column("risk_level", sa.String(10), nullable=False, server_default="low"),
        sa.Column("additional_notes", sa.Text(), nullable=True),
        sa.Column("ai_model_used", sa.String(100), nullable=True),
        sa.Column("ai_generated_at", sa.DateTime(), nullable=True),
        sa.Column("langfuse_trace_id", sa.String(200), nullable=True),
        sa.Column(
            "last_edited_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("last_edited_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_session_summaries_appointment_id",
        "session_summaries",
        ["appointment_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_session_summaries_appointment_id", table_name="session_summaries")
    op.drop_table("session_summaries")

    op.drop_index("ix_session_transcripts_appointment_id", table_name="session_transcripts")
    op.drop_table("session_transcripts")

    op.drop_index("ix_session_recordings_appointment_id", table_name="session_recordings")
    op.drop_table("session_recordings")
