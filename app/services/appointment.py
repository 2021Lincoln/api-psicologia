"""
app/services/appointment.py
----------------------------
Transactional write path for appointments.
Validates availability, prevents double-booking, calculates price.
"""

from __future__ import annotations

import logging
from datetime import datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.domain import (
    Appointment,
    AppointmentRead,
    AppointmentStatus,
    Availability,
    PsychologistProfile,
)

logger = logging.getLogger(__name__)

_SP = ZoneInfo("America/Sao_Paulo")


def _to_utc_naive(dt: datetime) -> datetime:
    if dt.tzinfo:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _utc_naive_to_sp_date(dt: datetime):
    """Convert a naive UTC datetime to its São Paulo local date."""
    return dt.replace(tzinfo=timezone.utc).astimezone(_SP).date()


# ---------------------------------------------------------------------------
# Domain exceptions
# ---------------------------------------------------------------------------


class AppointmentError(Exception):
    pass


class PsychologistNotFound(AppointmentError):
    pass


class PsychologistNotAcceptingPatients(AppointmentError):
    pass


class AppointmentInThePast(AppointmentError):
    pass


class OutsideAvailabilityWindow(AppointmentError):
    def __init__(self, scheduled_at: datetime) -> None:
        self.scheduled_at = scheduled_at
        local_dt = scheduled_at.replace(tzinfo=timezone.utc).astimezone(_SP)
        super().__init__(
            f"O horário {local_dt.strftime('%H:%M')} do dia {local_dt.strftime('%d/%m/%Y')} "
            f"não está dentro de nenhuma janela de disponibilidade configurada."
        )


class ConflictingAppointment(AppointmentError):
    def __init__(self, conflict: Appointment) -> None:
        self.conflict = conflict
        end = conflict.scheduled_at + timedelta(minutes=conflict.duration_minutes)
        super().__init__(
            f"Já existe um agendamento ({conflict.status.value}) das "
            f"{conflict.scheduled_at.strftime('%H:%M')} às {end.strftime('%H:%M')}."
        )


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def calculate_price(hourly_rate: Decimal, duration_minutes: int) -> Decimal:
    """Session price = hourly_rate × (duration / 60), rounded HALF_UP to 2 decimals."""
    return (hourly_rate * Decimal(duration_minutes) / Decimal(60)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def _slot_fits_window(start: datetime, end: datetime, window: Availability) -> bool:
    return window.start_time <= start.time() and end.time() <= window.end_time


def _slots_overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and a_end > b_start


# ---------------------------------------------------------------------------
# Validation steps
# ---------------------------------------------------------------------------


async def _load_and_lock_profile(
    session: AsyncSession, psychologist_profile_id: UUID
) -> PsychologistProfile:
    result = await session.execute(
        select(PsychologistProfile)
        .where(PsychologistProfile.id == psychologist_profile_id)
        .with_for_update()
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise PsychologistNotFound(f"Psicóloga id={psychologist_profile_id} não encontrada.")
    if not profile.is_accepting_patients:
        raise PsychologistNotAcceptingPatients(
            "Esta psicóloga não está aceitando novos pacientes no momento."
        )
    return profile


async def _validate_availability_window(
    session: AsyncSession,
    psychologist_profile_id: UUID,
    scheduled_at: datetime,
    session_end: datetime,
) -> None:
    # Convert UTC naive → SP local date for lookup
    local_date = _utc_naive_to_sp_date(scheduled_at)

    # Convert UTC naive → SP local time for window comparison
    # (window start/end times are stored in SP local time)
    scheduled_at_sp = scheduled_at.replace(tzinfo=timezone.utc).astimezone(_SP).replace(tzinfo=None)
    session_end_sp = session_end.replace(tzinfo=timezone.utc).astimezone(_SP).replace(tzinfo=None)

    result = await session.execute(
        select(Availability).where(
            and_(
                Availability.psychologist_profile_id == psychologist_profile_id,
                Availability.specific_date == local_date,
                Availability.is_active.is_(True),
            )
        )
    )
    windows = result.scalars().all()
    if not any(_slot_fits_window(scheduled_at_sp, session_end_sp, w) for w in windows):
        raise OutsideAvailabilityWindow(scheduled_at=scheduled_at)


async def _validate_no_conflict(
    session: AsyncSession,
    psychologist_profile_id: UUID,
    scheduled_at: datetime,
    session_end: datetime,
) -> None:
    result = await session.execute(
        select(Appointment).where(
            and_(
                Appointment.psychologist_profile_id == psychologist_profile_id,
                Appointment.status != AppointmentStatus.cancelled,
                Appointment.scheduled_at < session_end,   # DB-side pre-filter
            )
        )
    )
    for appt in result.scalars().all():
        appt_end = appt.scheduled_at + timedelta(minutes=appt.duration_minutes)
        if _slots_overlap(scheduled_at, session_end, appt.scheduled_at, appt_end):
            raise ConflictingAppointment(conflict=appt)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def create_appointment(
    session: AsyncSession,
    psychologist_profile_id: UUID,
    patient_id: UUID,
    scheduled_at: datetime,
) -> AppointmentRead:
    """
    Validate and create a pending appointment.

    Validation order
    ----------------
    1. Reject past datetimes (no I/O)
    2. SELECT FOR UPDATE on profile → accepts patients?
    3. Requested slot fits an active availability window
    4. No overlapping non-cancelled appointment
    5. Calculate price → INSERT
    """
    scheduled_at = _to_utc_naive(scheduled_at)
    now_utc = datetime.utcnow()
    if scheduled_at <= now_utc:
        raise AppointmentInThePast(f"A data/hora {scheduled_at.isoformat()} já passou.")

    profile = await _load_and_lock_profile(session, psychologist_profile_id)
    session_end = scheduled_at + timedelta(minutes=profile.session_duration_minutes)

    await _validate_availability_window(session, psychologist_profile_id, scheduled_at, session_end)
    await _validate_no_conflict(session, psychologist_profile_id, scheduled_at, session_end)

    price = calculate_price(profile.hourly_rate, profile.session_duration_minutes)
    appointment = Appointment(
        patient_id=patient_id,
        psychologist_profile_id=psychologist_profile_id,
        scheduled_at=scheduled_at,
        duration_minutes=profile.session_duration_minutes,
        price=price,
        status=AppointmentStatus.pending,
    )
    session.add(appointment)
    await session.flush()
    await session.refresh(appointment)

    logger.info(
        "Appointment created id=%s patient=%s psychologist=%s at=%s price=%s",
        appointment.id, patient_id, psychologist_profile_id,
        scheduled_at.isoformat(), price,
    )
    return _to_read(appointment)


async def get_appointment(
    session: AsyncSession, appointment_id: UUID, requesting_user_id: UUID
) -> AppointmentRead:
    result = await session.execute(
        select(Appointment).where(Appointment.id == appointment_id)
    )
    appointment = result.scalar_one_or_none()
    if appointment is None:
        raise ValueError(f"Agendamento {appointment_id} não encontrado.")

    profile = (await session.execute(
        select(PsychologistProfile).where(
            PsychologistProfile.id == appointment.psychologist_profile_id
        )
    )).scalar_one()

    if requesting_user_id not in (appointment.patient_id, profile.user_id):
        raise PermissionError("Acesso negado a este agendamento.")

    return _to_read(appointment)


async def list_patient_appointments(
    session: AsyncSession,
    patient_id: UUID,
    status_filter: AppointmentStatus | None = None,
) -> list[AppointmentRead]:
    stmt = select(Appointment).where(Appointment.patient_id == patient_id)
    if status_filter:
        stmt = stmt.where(Appointment.status == status_filter)
    result = await session.execute(stmt.order_by(Appointment.scheduled_at.desc()))
    return [_to_read(a) for a in result.scalars().all()]


async def list_psychologist_appointments(
    session: AsyncSession,
    psychologist_profile_id: UUID,
    status_filter: AppointmentStatus | None = None,
) -> list[AppointmentRead]:
    stmt = select(Appointment).where(
        Appointment.psychologist_profile_id == psychologist_profile_id
    )
    if status_filter:
        stmt = stmt.where(Appointment.status == status_filter)
    result = await session.execute(stmt.order_by(Appointment.scheduled_at.desc()))
    return [_to_read(a) for a in result.scalars().all()]


def _to_read(a: Appointment) -> AppointmentRead:
    def _utc(dt: datetime | None) -> datetime | None:
        return dt.replace(tzinfo=timezone.utc) if dt is not None else None

    return AppointmentRead(
        id=a.id,
        patient_id=a.patient_id,
        psychologist_profile_id=a.psychologist_profile_id,
        scheduled_at=_utc(a.scheduled_at),
        duration_minutes=a.duration_minutes,
        price=a.price,
        status=a.status,
        notes=a.notes,
        stripe_payment_intent_id=a.stripe_payment_intent_id,
        stripe_checkout_session_id=a.stripe_checkout_session_id,
        daily_room_name=a.daily_room_name,
        paid_at=_utc(a.paid_at),
        cancelled_at=_utc(a.cancelled_at),
        created_at=_utc(a.created_at),
    )
