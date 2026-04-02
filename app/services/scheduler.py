"""
app/services/scheduler.py
--------------------------
APScheduler persistente para jobs de lembretes de sessão.

Usa AsyncIOScheduler (in-process) com jobstore em memória.
Em produção com múltiplas instâncias, troque para SQLAlchemyJobStore apontando
para o mesmo banco de dados — assim apenas um worker executa cada job.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.executors.asyncio import AsyncIOExecutor

logger = logging.getLogger(__name__)

# ── Instância global ──────────────────────────────────────────────────────────

_scheduler = AsyncIOScheduler(
    jobstores={"default": MemoryJobStore()},
    executors={"default": AsyncIOExecutor()},
    job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 300},
    timezone="UTC",
)


def get_scheduler() -> AsyncIOScheduler:
    return _scheduler


def start_scheduler() -> None:
    if not _scheduler.running:
        _scheduler.start()
        logger.info("APScheduler iniciado.")


def shutdown_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler encerrado.")


# ── Jobs ─────────────────────────────────────────────────────────────────────


async def _send_session_reminder(appointment_id: str) -> None:
    """Job executado 15 min antes da sessão: envia email e WhatsApp."""
    from sqlalchemy import select

    from app.db.session import AsyncSessionLocal
    from app.models.domain import Appointment, AppointmentStatus, PsychologistProfile, User
    from app.services.notifications import _send_resend_email, _send_twilio_whatsapp

    async with AsyncSessionLocal() as db:
        appt = (
            await db.execute(select(Appointment).where(Appointment.id == appointment_id))
        ).scalar_one_or_none()

        if appt is None or appt.status != AppointmentStatus.paid:
            logger.info("Lembrete cancelado: appointment %s não encontrado ou não pago.", appointment_id)
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

        link = appt.daily_room_url or "(link indisponível)"
        text = (
            "Sua consulta de psicologia começa em 15 minutos.\n"
            f"Horário: {appt.scheduled_at.strftime('%d/%m/%Y às %H:%M')} UTC\n"
            f"Link: {link}"
        )

        if patient:
            if patient.email:
                await _send_resend_email(patient.email, "Sua consulta começa em 15 minutos", text)
            if patient.phone:
                await _send_twilio_whatsapp(patient.phone, text)

        # Avisa a psicóloga também
        if profile:
            psico_user = (
                await db.execute(select(User).where(User.id == profile.user_id))
            ).scalar_one_or_none()
            if psico_user and psico_user.phone:
                await _send_twilio_whatsapp(psico_user.phone, text)

    logger.info("Lembrete de 15 min enviado para appointment %s.", appointment_id)


def schedule_session_reminder(appointment_id: UUID, scheduled_at: datetime) -> None:
    """Agenda o lembrete de 15 min para a sessão.

    Idempotente — substitui job anterior com mesmo ID se existir.
    """
    job_id = f"reminder_{appointment_id}"
    run_at = scheduled_at.replace(tzinfo=timezone.utc) - timedelta(minutes=15)

    if run_at <= datetime.now(timezone.utc):
        logger.debug("Lembrete para %s já passou — não agendado.", appointment_id)
        return

    _scheduler.add_job(
        _send_session_reminder,
        trigger="date",
        run_date=run_at,
        args=[str(appointment_id)],
        id=job_id,
        replace_existing=True,
    )
    logger.info("Lembrete agendado para %s às %s UTC.", appointment_id, run_at.isoformat())


def cancel_session_reminder(appointment_id: UUID) -> None:
    """Remove o lembrete agendado se o agendamento for cancelado."""
    job_id = f"reminder_{appointment_id}"
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)
        logger.info("Lembrete removido para appointment %s.", appointment_id)
