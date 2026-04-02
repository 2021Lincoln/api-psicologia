"""
Agendamentos (paciente).

POST /api/v1/appointments  — cria um agendamento pendente para checkout.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentPatient
from app.api.deps import CurrentUser
from app.db.session import get_session
from app.models.domain import Appointment, AppointmentRead, AppointmentStatus, PsychologistProfile, User
from app.services.appointment import (
    AppointmentInThePast,
    ConflictingAppointment,
    OutsideAvailabilityWindow,
    PsychologistNotAcceptingPatients,
    PsychologistNotFound,
    create_appointment,
)
from app.services.schedule import cancel_appointment

router = APIRouter(prefix="/appointments", tags=["Appointments"])


class BookRequest(BaseModel):
    psychologist_id: UUID
    scheduled_at: datetime

    @field_validator("scheduled_at")
    @classmethod
    def require_timezone(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("scheduled_at deve incluir timezone (use UTC).")
        return v.astimezone(timezone.utc)


class BookResponse(BaseModel):
    appointment_id: UUID
    status: str = "pending"


class JoinResponse(BaseModel):
    video_url: str


@router.post(
    "",
    response_model=BookResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Paciente agenda uma sessão",
)
async def book_appointment(
    body: BookRequest,
    patient: CurrentPatient,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> BookResponse:
    """Paciente agenda uma sessão pendente, validando disponibilidade e conflitos."""
    try:
        appt = await create_appointment(
            session=db,
            psychologist_profile_id=body.psychologist_id,
            patient_id=patient.id,
            scheduled_at=body.scheduled_at,
        )
        await db.commit()
    except PsychologistNotFound as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))
    except PsychologistNotAcceptingPatients as e:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(e))
    except OutsideAvailabilityWindow as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except AppointmentInThePast as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except ConflictingAppointment as e:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(e))

    return BookResponse(appointment_id=appt.id)


def _appt_to_read(a: Appointment, patient_name: str | None = None) -> AppointmentRead:
    def _utc(dt: datetime | None) -> datetime | None:
        return dt.replace(tzinfo=timezone.utc) if dt is not None else None

    return AppointmentRead(
        id=a.id,
        patient_id=a.patient_id,
        psychologist_profile_id=a.psychologist_profile_id,
        patient_full_name=patient_name,
        scheduled_at=_utc(a.scheduled_at),
        duration_minutes=a.duration_minutes,
        price=a.price,
        status=a.status,
        notes=a.notes,
        stripe_payment_intent_id=a.stripe_payment_intent_id,
        stripe_checkout_session_id=a.stripe_checkout_session_id,
        daily_room_name=a.daily_room_name,
        daily_room_url=a.daily_room_url,
        paid_at=_utc(a.paid_at),
        cancelled_at=_utc(a.cancelled_at),
        created_at=_utc(a.created_at),
    )


@router.get(
    "/{appointment_id}",
    response_model=AppointmentRead,
    summary="Detalhes de um agendamento",
)
async def get_appointment(
    appointment_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> AppointmentRead:
    """Retorna detalhes de um agendamento. Apenas paciente ou psicóloga envolvidos podem ver."""
    appt = (
        await db.execute(select(Appointment).where(Appointment.id == appointment_id))
    ).scalar_one_or_none()
    if appt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Agendamento não encontrado.")

    profile = (
        await db.execute(
            select(PsychologistProfile).where(PsychologistProfile.id == appt.psychologist_profile_id)
        )
    ).scalar_one_or_none()
    owner_id = profile.user_id if profile else None

    if current_user.id not in (appt.patient_id, owner_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Acesso negado a este agendamento.")

    return _appt_to_read(appt)


@router.get(
    "/me/patient",
    response_model=list[AppointmentRead],
    summary="Lista agendamentos do paciente logado",
)
async def list_my_patient_appointments(
    patient: CurrentPatient,
    db: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[AppointmentRead]:
    rows = (
        await db.execute(
            select(Appointment)
            .where(Appointment.patient_id == patient.id)
            .order_by(Appointment.scheduled_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return [_appt_to_read(a) for a in rows]


@router.get(
    "/me/psychologist",
    response_model=list[AppointmentRead],
    summary="Lista agendamentos da psicóloga logada",
)
async def list_my_psychologist_appointments(
    db: Annotated[AsyncSession, Depends(get_session)],
    current_user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[AppointmentRead]:
    profile = (
        await db.execute(
            select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Perfil de psicóloga não encontrado.")
    rows = (
        await db.execute(
            select(Appointment, User.full_name)
            .join(User, Appointment.patient_id == User.id)
            .where(Appointment.psychologist_profile_id == profile.id)
            .order_by(Appointment.scheduled_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return [_appt_to_read(a, patient_name=name) for a, name in rows]


@router.delete(
    "/{appointment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Cancelar agendamento (paciente ou psicóloga)",
)
async def cancel(
    appointment_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    try:
        await cancel_appointment(db, appointment_id, current_user.id)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=str(e))
    from fastapi.responses import Response as R
    return R(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{appointment_id}/join",
    response_model=JoinResponse,
    summary="Retorna o link de video se pago e faltando <= 10 minutos",
)
async def join_link(
    appointment_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> JoinResponse:
    appt = (
        await db.execute(select(Appointment).where(Appointment.id == appointment_id))
    ).scalar_one_or_none()
    if appt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Agendamento não encontrado.")
    if appt.status != AppointmentStatus.paid:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, detail="Pagamento não confirmado.")
    if not appt.daily_room_url:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Sala de vídeo ainda não foi criada.")

    profile = (
        await db.execute(
            select(PsychologistProfile).where(PsychologistProfile.id == appt.psychologist_profile_id)
        )
    ).scalar_one()
    if current_user.id not in (appt.patient_id, profile.user_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Acesso negado a este agendamento.")

    now_utc = datetime.utcnow()
    join_window_open = appt.scheduled_at - timedelta(minutes=10)
    if now_utc < join_window_open:
        raise HTTPException(
            status_code=425,
            detail={
                "message": "Link liberado apenas 10 minutos antes da sessão.",
                "minutes_to_open": int((join_window_open - now_utc).total_seconds() / 60),
            },
        )

    return JoinResponse(video_url=appt.daily_room_url)
