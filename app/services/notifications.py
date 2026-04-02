"""
Envio de notificações transacionais (e-mail ou WhatsApp).
Implementação leve usando Resend (e-mail) e Twilio (WhatsApp), opcionais via .env.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.domain import Appointment, AppointmentStatus, PsychologistProfile, User

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Low-level providers
# ---------------------------------------------------------------------------


async def _send_resend_email(to: str, subject: str, text: str) -> None:
    if not settings.resend_api_key or not settings.resend_from_email:
        logger.debug("Resend não configurado — pulando envio.")
        return
    payload = {"from": settings.resend_from_email, "to": to, "subject": subject, "text": text}
    headers = {"Authorization": f"Bearer {settings.resend_api_key}"}
    async with httpx.AsyncClient(timeout=8) as client:
        resp = await client.post("https://api.resend.com/emails", json=payload, headers=headers)
    if resp.is_error:
        logger.warning("Falha ao enviar e-mail via Resend: %s %s", resp.status_code, resp.text)


async def _send_twilio_whatsapp(to: str, body: str) -> None:
    if not settings.twilio_account_sid or not settings.twilio_auth_token or not settings.twilio_whatsapp_from:
        logger.debug("Twilio não configurado — pulando WhatsApp.")
        return
    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
    data = {"From": settings.twilio_whatsapp_from, "To": f"whatsapp:{to}", "Body": body}
    async with httpx.AsyncClient(timeout=8, auth=(settings.twilio_account_sid, settings.twilio_auth_token)) as client:
        resp = await client.post(url, data=data)
    if resp.is_error:
        logger.warning("Falha ao enviar WhatsApp via Twilio: %s %s", resp.status_code, resp.text)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def notify_payment_confirmed(
    session: AsyncSession,
    appointment: Appointment,
    patient: Optional[User],
) -> None:
    """Envia confirmação de pagamento ao paciente (email e/ou WhatsApp)."""
    subject = "Seu agendamento foi confirmado!"
    room_line = f"\nLink da sessão: {appointment.daily_room_url}" if appointment.daily_room_url else ""
    text = (
        "Olá! Recebemos o pagamento do seu agendamento de psicologia.\n"
        f"Data/hora (UTC): {appointment.scheduled_at.isoformat()}\n"
        f"Valor: R${appointment.price}\n"
        f"{room_line}\n\nAté breve!"
    )
    if patient:
        if patient.email:
            await _send_resend_email(patient.email, subject, text)
        if patient.phone:
            await _send_twilio_whatsapp(patient.phone, text)


async def schedule_15min_reminder(appointment_id: str, scheduled_at: datetime) -> None:
    """
    Agenda um lembrete para T-15 min. In-memory; para produção use fila (Celery/Sidekiq/etc).
    Não lança exceções para não quebrar o fluxo de pagamento.
    """
    delay = (scheduled_at - timedelta(minutes=15) - datetime.now(tz=timezone.utc)).total_seconds()
    if delay <= 0:
        delay = 0

    async def _task() -> None:
        try:
            await asyncio.sleep(delay)
            async with AsyncSessionLocal() as db:
                appt = (
                    await db.execute(
                        select(Appointment).where(Appointment.id == appointment_id)
                    )
                ).scalar_one_or_none()
                if appt is None or appt.status != AppointmentStatus.paid:
                    return
                patient = (
                    await db.execute(select(User).where(User.id == appt.patient_id))
                ).scalar_one_or_none()
                profile = (
                    await db.execute(
                        select(PsychologistProfile).where(
                            PsychologistProfile.id == appt.psychologist_profile_id
                        )
                    )
                ).scalar_one_or_none()
                link = appt.daily_room_url or ""
                text = (
                    "Sua consulta começa em 15 minutos.\n"
                    f"Horário (UTC): {appt.scheduled_at.isoformat()}\n"
                    f"Link: {link}"
                )
                if patient:
                    if patient.email:
                        await _send_resend_email(patient.email, "Sua consulta começa em 15 minutos", text)
                    if patient.phone:
                        await _send_twilio_whatsapp(patient.phone, text)
                # Opcional: avisar psicóloga
                if profile and profile.user and profile.user.phone:
                    await _send_twilio_whatsapp(profile.user.phone, text)
        except Exception as exc:  # pragma: no cover - não queremos crashar o worker
            logger.exception("Erro ao enviar lembrete de 15 min: %s", exc)

    asyncio.create_task(_task())
