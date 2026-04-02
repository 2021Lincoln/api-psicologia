"""
app/services/schedule.py
------------------------
Read-only schedule queries: compute available time slots for a given date.
Used by the calendar UI before the patient selects a specific slot.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.domain import (
    Appointment,
    AppointmentRead,
    AppointmentStatus,
    Availability,
    PsychologistProfile,
)

_DEFAULT_TZ = "America/Sao_Paulo"


# ---------------------------------------------------------------------------
# Value objects
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TimeSlot:
    start: datetime
    end: datetime
    booked: bool = False  # True = horário já reservado por outro paciente

    @property
    def duration_minutes(self) -> int:
        return int((self.end - self.start).total_seconds() / 60)

    def overlaps(self, other: "TimeSlot") -> bool:
        return self.start < other.end and self.end > other.start


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class PsychologistNotFound(Exception):
    pass


class SlotNotAvailable(Exception):
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_tz(tz: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz)
    except (ZoneInfoNotFoundError, KeyError):
        return ZoneInfo(_DEFAULT_TZ)


def _build_slots_from_window(
    target_date: date,
    window_start: time,
    window_end: time,
    duration_minutes: int,
    local_tz: ZoneInfo,
) -> list[TimeSlot]:
    """
    Generate slots for a specific date and availability window.
    Slots are converted to UTC naive for uniform comparison with appointments.
    """
    slots: list[TimeSlot] = []
    cursor = datetime.combine(target_date, window_start)
    window_finish = datetime.combine(target_date, window_end)
    delta = timedelta(minutes=duration_minutes)

    while cursor + delta <= window_finish:
        slot_end = cursor + delta
        utc_start = cursor.replace(tzinfo=local_tz).astimezone(timezone.utc).replace(tzinfo=None)
        utc_end = slot_end.replace(tzinfo=local_tz).astimezone(timezone.utc).replace(tzinfo=None)
        slots.append(TimeSlot(start=utc_start, end=utc_end))
        cursor += delta

    return slots


def _appointments_to_slots(appointments: list[Appointment]) -> list[TimeSlot]:
    return [
        TimeSlot(
            start=appt.scheduled_at,
            end=appt.scheduled_at + timedelta(minutes=appt.duration_minutes),
        )
        for appt in appointments
    ]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def get_available_slots(
    session: AsyncSession,
    psychologist_profile_id: UUID,
    day: date,
    tz: str = _DEFAULT_TZ,
) -> list[TimeSlot]:
    """
    Return free time slots for a psychologist on a given local calendar date.

    Availability is stored as specific dates (not weekly recurring).
    """
    local_tz = _resolve_tz(tz)

    profile_result = await session.execute(
        select(PsychologistProfile).where(PsychologistProfile.id == psychologist_profile_id)
    )
    profile = profile_result.scalar_one_or_none()
    if profile is None:
        raise PsychologistNotFound(f"PsychologistProfile id={psychologist_profile_id} não encontrado.")

    # Look up availability entries for this exact date
    avail_result = await session.execute(
        select(Availability).where(
            and_(
                Availability.psychologist_profile_id == psychologist_profile_id,
                Availability.specific_date == day,
                Availability.is_active.is_(True),
            )
        )
    )
    availabilities = avail_result.scalars().all()
    if not availabilities:
        return []

    # UTC range for the local day (to query booked appointments)
    utc_day_start = (
        datetime(day.year, day.month, day.day, 0, 0, 0, tzinfo=local_tz)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    utc_day_end = (
        datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=local_tz)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )

    appt_result = await session.execute(
        select(Appointment).where(
            and_(
                Appointment.psychologist_profile_id == psychologist_profile_id,
                Appointment.scheduled_at >= utc_day_start,
                Appointment.scheduled_at <= utc_day_end,
                Appointment.status != AppointmentStatus.cancelled,
            )
        )
    )
    booked_slots = _appointments_to_slots(appt_result.scalars().all())

    now_utc = datetime.utcnow()

    all_slots: list[TimeSlot] = []
    for window in availabilities:
        for candidate in _build_slots_from_window(
            day,
            window.start_time,
            window.end_time,
            profile.session_duration_minutes,
            local_tz,
        ):
            if candidate.start <= now_utc:  # horário passado → ocultar
                continue
            is_booked = any(candidate.overlaps(b) for b in booked_slots)
            all_slots.append(TimeSlot(start=candidate.start, end=candidate.end, booked=is_booked))

    return sorted(all_slots, key=lambda s: s.start)


async def cancel_appointment(
    session: AsyncSession,
    appointment_id: UUID,
    requesting_user_id: UUID,
    reason: str | None = None,
) -> AppointmentRead:
    """Cancela agendamento e emite reembolso Stripe quando aplicável.

    Política de reembolso:
    - Cancelamento com ≥ 24h de antecedência → reembolso total
    - Entre 3h e 24h → reembolso de 50%
    - Menos de 3h → cancelamento bloqueado
    - Psicóloga sempre pode cancelar com reembolso total
    """
    import logging
    import stripe
    from app.core.config import settings

    log = logging.getLogger(__name__)

    result = await session.execute(
        select(Appointment).where(Appointment.id == appointment_id).with_for_update()
    )
    appointment = result.scalar_one_or_none()
    if appointment is None:
        raise ValueError(f"Agendamento {appointment_id} não encontrado.")

    profile_result = await session.execute(
        select(PsychologistProfile).where(
            PsychologistProfile.id == appointment.psychologist_profile_id
        )
    )
    profile = profile_result.scalar_one()
    is_psychologist = requesting_user_id == profile.user_id

    if requesting_user_id not in (appointment.patient_id, profile.user_id):
        raise PermissionError("Apenas o paciente ou a psicóloga podem cancelar.")

    # Idempotente
    if appointment.status == AppointmentStatus.cancelled:
        return AppointmentRead(
            id=appointment.id,
            patient_id=appointment.patient_id,
            psychologist_profile_id=appointment.psychologist_profile_id,
            scheduled_at=appointment.scheduled_at,
            duration_minutes=appointment.duration_minutes,
            price=appointment.price,
            status=appointment.status,
            notes=appointment.notes,
            paid_at=appointment.paid_at,
            cancelled_at=appointment.cancelled_at,
            created_at=appointment.created_at,
        )

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    hours_until = (appointment.scheduled_at - now_utc).total_seconds() / 3600

    # Paciente não pode cancelar com < 3h de antecedência
    if not is_psychologist and 0 < hours_until < 3:
        raise ValueError(
            "Cancelamento não permitido com menos de 3 horas de antecedência."
        )

    # Reembolso Stripe se pagamento foi feito
    if appointment.status == AppointmentStatus.paid and appointment.stripe_payment_intent_id:
        try:
            stripe.api_key = settings.stripe_secret_key
            price_cents = int(appointment.price * 100)

            # Psicóloga ou ≥24h → reembolso total; entre 3-24h → 50%
            if is_psychologist or hours_until >= 24:
                refund_amount = price_cents
                refund_reason = "Reembolso total"
            else:
                refund_amount = price_cents // 2
                refund_reason = "Reembolso parcial (50%) — cancelamento < 24h"

            stripe.Refund.create(
                payment_intent=appointment.stripe_payment_intent_id,
                amount=refund_amount,
            )
            log.info(
                "Reembolso emitido: appointment=%s valor=%d centavos (%s)",
                appointment_id, refund_amount, refund_reason,
            )
        except stripe.error.StripeError as exc:
            log.error("Falha ao emitir reembolso Stripe: %s", exc)
            # Não bloqueia o cancelamento — equipe pode reembolsar manualmente

    appointment.status = AppointmentStatus.cancelled
    appointment.cancelled_at = now_utc
    appointment.cancellation_reason = reason
    appointment.updated_at = now_utc
    session.add(appointment)
    await session.flush()
    await session.refresh(appointment)

    # Remove lembrete agendado
    try:
        from app.services.scheduler import cancel_session_reminder
        cancel_session_reminder(appointment.id)
    except Exception:
        pass  # scheduler pode não estar rodando em testes

    return AppointmentRead(
        id=appointment.id,
        patient_id=appointment.patient_id,
        psychologist_profile_id=appointment.psychologist_profile_id,
        scheduled_at=appointment.scheduled_at,
        duration_minutes=appointment.duration_minutes,
        price=appointment.price,
        status=appointment.status,
        notes=appointment.notes,
        paid_at=appointment.paid_at,
        cancelled_at=appointment.cancelled_at,
        created_at=appointment.created_at,
    )
