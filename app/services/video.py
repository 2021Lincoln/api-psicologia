"""
app/services/video.py
---------------------
Daily.co integration: create private rooms and issue time-gated meeting tokens.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.domain import Appointment, AppointmentStatus, PsychologistProfile

logger = logging.getLogger(__name__)

DAILY_API_BASE = "https://api.daily.co/v1"
JOIN_WINDOW_MINUTES = 5
ROOM_EXPIRY_BUFFER_MINUTES = 60


# ---------------------------------------------------------------------------
# Value objects & exceptions
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RoomAccess:
    meeting_token: str
    room_url: str
    expires_at: datetime
    is_owner: bool


class RoomNotReady(Exception):
    pass


class TooEarlyToJoin(Exception):
    def __init__(self, starts_in: timedelta) -> None:
        self.starts_in = starts_in
        minutes = int(starts_in.total_seconds() / 60)
        super().__init__(
            f"Sessão começa em {minutes} min. "
            f"Link liberado {JOIN_WINDOW_MINUTES} min antes."
        )


class AppointmentAccessDenied(Exception):
    pass


# ---------------------------------------------------------------------------
# Daily.co HTTP helpers
# ---------------------------------------------------------------------------


def _to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.daily_api_key}",
        "Content-Type": "application/json",
    }


async def create_daily_room(appointment: Appointment) -> dict:
    """Create a private Daily.co room. Room name is deterministic from appointment UUID."""
    scheduled = _to_utc(appointment.scheduled_at)
    session_end = scheduled + timedelta(minutes=appointment.duration_minutes)
    nbf_ts = int((scheduled - timedelta(minutes=JOIN_WINDOW_MINUTES)).timestamp())
    exp_ts = int((session_end + timedelta(minutes=ROOM_EXPIRY_BUFFER_MINUTES)).timestamp())

    payload = {
        "name": f"psico-{appointment.id}",
        "privacy": "private",
        "properties": {
            "nbf": nbf_ts,
            "exp": exp_ts,
            "max_participants": 2,
            "enable_recording": "cloud",
            "enable_chat": True,
            "enable_knocking": True,
            "autojoin": False,
        },
    }
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(f"{DAILY_API_BASE}/rooms", headers=_headers(), json=payload)
        response.raise_for_status()
        return response.json()


async def _create_meeting_token(
    room_name: str,
    user_display_name: str,
    is_owner: bool,
    nbf: datetime,
    exp: datetime,
) -> str:
    payload = {
        "properties": {
            "room_name": room_name,
            "user_name": user_display_name,
            "is_owner": is_owner,
            "nbf": int(nbf.timestamp()),
            "exp": int(exp.timestamp()),
            "enable_recording": "none",
        }
    }
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            f"{DAILY_API_BASE}/meeting-tokens", headers=_headers(), json=payload
        )
        response.raise_for_status()
        return response.json()["token"]


# ---------------------------------------------------------------------------
# Mock room (public Daily.co; falls back to Jitsi if Daily.co unavailable)
# ---------------------------------------------------------------------------


_JITSI_TOOLBAR = (
    '["microphone","camera","hangup","chat","fullscreen","tileview","settings","security"]'
)


async def create_mock_room(
    appointment: Appointment,
    psychologist_name: str | None = None,
) -> tuple[str, str]:
    """Return (room_url, room_name) for a mock/test payment.

    Tries to create a *public* Daily.co room so both participants can join
    without meeting tokens (and the psychologist becomes the room owner
    automatically). Falls back to a Jitsi URL if Daily.co is unreachable or
    the API key is invalid.
    """
    room_id = str(appointment.id).replace("-", "")[:16]
    subject = psychologist_name or "Consulta de Psicologia"
    jitsi_fragment = (
        f"config.subject={subject.replace(' ', '%20')}"
        f"&config.toolbarButtons={_JITSI_TOOLBAR}"
        "&config.disableInviteFunctions=true"
        "&config.prejoinPageEnabled=false"
    )
    jitsi_url = f"https://meet.jit.si/psicologia-{room_id}#{jitsi_fragment}"
    jitsi_name = f"psicologia-{room_id}"

    try:
        scheduled = _to_utc(appointment.scheduled_at)
        session_end = scheduled + timedelta(minutes=appointment.duration_minutes)
        exp_ts = int((session_end + timedelta(minutes=ROOM_EXPIRY_BUFFER_MINUTES)).timestamp())

        payload = {
            "name": f"mock-{room_id}",
            "privacy": "public",
            "properties": {
                "exp": exp_ts,
                "max_participants": 2,
                "enable_recording": "none",
                "enable_chat": True,
                "enable_knocking": False,
            },
        }
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{DAILY_API_BASE}/rooms", headers=_headers(), json=payload
            )
            response.raise_for_status()
            room = response.json()
            logger.info("Mock Daily.co room created: %s", room["url"])
            return room["url"], room["name"]
    except Exception as exc:
        logger.warning(
            "Daily.co mock room creation failed (%s) — falling back to Jitsi.", exc
        )
        return jitsi_url, jitsi_name


# ---------------------------------------------------------------------------
# Post-payment provisioning
# ---------------------------------------------------------------------------


async def provision_room_after_payment(
    db_session: AsyncSession, appointment: Appointment
) -> None:
    """Idempotent: create Daily room and persist to appointment after payment confirmed."""
    if appointment.daily_room_name:
        logger.info("Room already provisioned for appointment %s — skipping.", appointment.id)
        return

    try:
        room = await create_daily_room(appointment)
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Failed to create Daily room for appointment %s: %s — %s",
            appointment.id, exc.response.status_code, exc.response.text,
        )
        return

    appointment.daily_room_name = room["name"]
    appointment.daily_room_url = room["url"]
    appointment.updated_at = datetime.utcnow()
    db_session.add(appointment)


# ---------------------------------------------------------------------------
# Room access (time-gated)
# ---------------------------------------------------------------------------


async def get_room_access(
    db_session: AsyncSession,
    appointment_id: UUID,
    requesting_user_id: UUID,
    requesting_user_name: str,
) -> RoomAccess:
    result = await db_session.execute(
        select(Appointment).where(Appointment.id == appointment_id)
    )
    appointment = result.scalar_one_or_none()

    if appointment is None or appointment.status != AppointmentStatus.paid:
        raise RoomNotReady(f"Agendamento {appointment_id} não está pago ou não existe.")

    if not appointment.daily_room_name or not appointment.daily_room_url:
        raise RoomNotReady(f"Sala de vídeo ainda não provisionada para {appointment_id}.")

    profile = (await db_session.execute(
        select(PsychologistProfile).where(
            PsychologistProfile.id == appointment.psychologist_profile_id
        )
    )).scalar_one()

    is_patient = appointment.patient_id == requesting_user_id
    is_psychologist = profile.user_id == requesting_user_id
    if not (is_patient or is_psychologist):
        raise AppointmentAccessDenied("Acesso negado à sala de vídeo.")

    now = datetime.now(tz=timezone.utc)
    scheduled = _to_utc(appointment.scheduled_at)
    window_open = scheduled - timedelta(minutes=JOIN_WINDOW_MINUTES)

    if now < window_open:
        raise TooEarlyToJoin(starts_in=scheduled - now)

    session_end = scheduled + timedelta(minutes=appointment.duration_minutes)

    if now > session_end:
        raise RoomNotReady(
            f"Sessão encerrada às {session_end.strftime('%H:%M')}. "
            "O acesso à sala não está mais disponível."
        )
    token_exp = session_end + timedelta(minutes=ROOM_EXPIRY_BUFFER_MINUTES)

    token = await _create_meeting_token(
        room_name=appointment.daily_room_name,
        user_display_name=requesting_user_name,
        is_owner=is_psychologist,
        nbf=now,
        exp=token_exp,
    )
    return RoomAccess(
        meeting_token=token,
        room_url=appointment.daily_room_url,
        expires_at=token_exp,
        is_owner=is_psychologist,
    )
