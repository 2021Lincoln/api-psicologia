"""
app/api/v1/admin.py
--------------------
Rotas exclusivas para administradores.

GET  /api/v1/admin/stats   — métricas gerais da plataforma
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated

from app.api.deps import CurrentUser
from app.db.session import get_session
from app.models.domain import (
    Appointment,
    AppointmentStatus,
    PsychologistProfile,
    User,
    UserRole,
)

router = APIRouter(prefix="/admin", tags=["Admin"])


class PlatformStats(BaseModel):
    total_users: int
    total_patients: int
    total_psychologists: int
    psychologists_verified: int
    psychologists_pending: int
    total_appointments: int
    appointments_paid: int
    appointments_pending: int
    appointments_cancelled: int


def _require_admin(current_user: User) -> None:
    if current_user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Apenas administradores.")


@router.get(
    "/stats",
    response_model=PlatformStats,
    summary="[Admin] Métricas gerais da plataforma",
)
async def get_stats(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> PlatformStats:
    _require_admin(current_user)

    total_users = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    total_patients = (
        await db.execute(select(func.count()).select_from(User).where(User.role == UserRole.patient))
    ).scalar_one()
    total_psychologists = (
        await db.execute(select(func.count()).select_from(PsychologistProfile))
    ).scalar_one()
    psychologists_verified = (
        await db.execute(
            select(func.count()).select_from(PsychologistProfile).where(PsychologistProfile.is_verified.is_(True))
        )
    ).scalar_one()
    total_appointments = (await db.execute(select(func.count()).select_from(Appointment))).scalar_one()
    appointments_paid = (
        await db.execute(
            select(func.count()).select_from(Appointment).where(Appointment.status == AppointmentStatus.paid)
        )
    ).scalar_one()
    appointments_pending = (
        await db.execute(
            select(func.count()).select_from(Appointment).where(Appointment.status == AppointmentStatus.pending)
        )
    ).scalar_one()
    appointments_cancelled = (
        await db.execute(
            select(func.count()).select_from(Appointment).where(Appointment.status == AppointmentStatus.cancelled)
        )
    ).scalar_one()

    return PlatformStats(
        total_users=total_users,
        total_patients=total_patients,
        total_psychologists=total_psychologists,
        psychologists_verified=psychologists_verified,
        psychologists_pending=total_psychologists - psychologists_verified,
        total_appointments=total_appointments,
        appointments_paid=appointments_paid,
        appointments_pending=appointments_pending,
        appointments_cancelled=appointments_cancelled,
    )
