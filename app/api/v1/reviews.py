"""
app/api/v1/reviews.py
---------------------
POST /api/v1/appointments/{appointment_id}/review  — paciente avalia consulta concluída
GET  /api/v1/psychologists/{psychologist_id}/reviews — lista pública de avaliações
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.db.session import get_session
from app.models.domain import (
    Appointment,
    AppointmentStatus,
    PsychologistProfile,
    Review,
    ReviewRead,
    User,
    UserRole,
)

router = APIRouter(tags=["Reviews"])


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)


# ── POST /appointments/{appointment_id}/review ────────────────────────────────


@router.post(
    "/appointments/{appointment_id}/review",
    response_model=ReviewRead,
    status_code=status.HTTP_201_CREATED,
    summary="Paciente avalia consulta realizada",
)
async def create_review(
    appointment_id: UUID,
    body: ReviewCreate,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReviewRead:
    if current_user.role != UserRole.patient:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Apenas pacientes podem avaliar.")

    appt = (
        await session.execute(
            select(Appointment).where(
                Appointment.id == appointment_id,
                Appointment.patient_id == current_user.id,
            )
        )
    ).scalar_one_or_none()

    if appt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Consulta não encontrada.")
    if appt.status != AppointmentStatus.paid:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Só é possível avaliar consultas pagas/realizadas.",
        )

    existing = (
        await session.execute(select(Review).where(Review.appointment_id == appointment_id))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Consulta já foi avaliada."
        )

    review = Review(
        appointment_id=appointment_id,
        patient_id=current_user.id,
        psychologist_profile_id=appt.psychologist_profile_id,
        rating=body.rating,
        comment=body.comment,
    )
    session.add(review)
    await session.commit()
    await session.refresh(review)

    return ReviewRead(
        id=review.id,
        appointment_id=review.appointment_id,
        patient_id=review.patient_id,
        psychologist_profile_id=review.psychologist_profile_id,
        rating=review.rating,
        comment=review.comment,
        patient_name=current_user.full_name,
        created_at=review.created_at,
    )


# ── GET /psychologists/{psychologist_id}/reviews ──────────────────────────────


class ReviewsResponse(BaseModel):
    reviews: list[ReviewRead]
    avg_rating: float | None
    total: int


@router.get(
    "/psychologists/{psychologist_id}/reviews",
    response_model=ReviewsResponse,
    summary="Lista de avaliações de uma psicóloga",
)
async def list_reviews(
    psychologist_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReviewsResponse:
    profile = (
        await session.execute(
            select(PsychologistProfile).where(PsychologistProfile.id == psychologist_id)
        )
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Perfil não encontrado.")

    rows = (
        await session.execute(
            select(Review, User.full_name)
            .join(User, Review.patient_id == User.id)
            .where(Review.psychologist_profile_id == psychologist_id)
            .order_by(Review.created_at.desc())
        )
    ).all()

    review_reads = [
        ReviewRead(
            id=review.id,
            appointment_id=review.appointment_id,
            patient_id=review.patient_id,
            psychologist_profile_id=review.psychologist_profile_id,
            rating=review.rating,
            comment=review.comment,
            patient_name=full_name,
            created_at=review.created_at,
        )
        for review, full_name in rows
    ]

    avg = (
        await session.execute(
            select(func.avg(Review.rating)).where(
                Review.psychologist_profile_id == psychologist_id
            )
        )
    ).scalar_one_or_none()

    return ReviewsResponse(
        reviews=review_reads,
        avg_rating=round(float(avg), 1) if avg else None,
        total=len(review_reads),
    )


# ── GET /appointments/{appointment_id}/review (check if reviewed) ─────────────


@router.get(
    "/appointments/{appointment_id}/review",
    response_model=ReviewRead | None,
    summary="Verifica se consulta já foi avaliada",
)
async def get_review(
    appointment_id: UUID,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReviewRead | None:
    review = (
        await session.execute(
            select(Review)
            .join(Review.patient)
            .where(
                Review.appointment_id == appointment_id,
                Review.patient_id == current_user.id,
            )
        )
    ).scalar_one_or_none()

    if review is None:
        return None

    return ReviewRead(
        id=review.id,
        appointment_id=review.appointment_id,
        patient_id=review.patient_id,
        psychologist_profile_id=review.psychologist_profile_id,
        rating=review.rating,
        comment=review.comment,
        patient_name=current_user.full_name,
        created_at=review.created_at,
    )
