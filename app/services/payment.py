"""
app/services/payment.py
-----------------------
Stripe Checkout Session creation and webhook event processing.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.domain import Appointment, AppointmentRead, AppointmentStatus, User
from app.services.notifications import notify_payment_confirmed
from app.services.scheduler import schedule_session_reminder
from app.services.video import provision_room_after_payment

logger = logging.getLogger(__name__)
stripe.api_key = settings.stripe_secret_key


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class AppointmentNotFound(Exception):
    pass


class PaymentAlreadyProcessed(Exception):
    pass


# ---------------------------------------------------------------------------
# Checkout Session
# ---------------------------------------------------------------------------


async def create_checkout_session(
    session: AsyncSession,
    appointment_id: UUID,
    customer_email: str,
) -> stripe.checkout.Session:
    """Create (or reuse) a Stripe Checkout Session for the given appointment."""
    result = await session.execute(
        select(Appointment).where(Appointment.id == appointment_id)
    )
    appointment = result.scalar_one_or_none()
    if appointment is None:
        raise AppointmentNotFound(f"Agendamento {appointment_id} não encontrado.")
    if appointment.status == AppointmentStatus.paid:
        raise PaymentAlreadyProcessed(f"Agendamento {appointment_id} já está pago.")
    if appointment.status == AppointmentStatus.cancelled:
        raise PaymentAlreadyProcessed(f"Agendamento {appointment_id} está cancelado.")

    # Idempotency: reuse existing session
    if appointment.stripe_checkout_session_id:
        logger.info("Reusing Checkout Session %s", appointment.stripe_checkout_session_id)
        return stripe.checkout.Session.retrieve(appointment.stripe_checkout_session_id)

    amount_cents = int(appointment.price * 100)
    checkout_session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        mode="payment",
        customer_email=customer_email,
        line_items=[{
            "price_data": {
                "currency": "brl",
                "unit_amount": amount_cents,
                "product_data": {
                    "name": "Sessão de Psicologia",
                    "description": f"Sessão em {appointment.scheduled_at.strftime('%d/%m/%Y às %H:%M')} UTC",
                },
            },
            "quantity": 1,
        }],
        metadata={"appointment_id": str(appointment_id)},
        success_url=settings.frontend_success_url + "?session_id={CHECKOUT_SESSION_ID}",
        cancel_url=settings.frontend_cancel_url,
        expires_at=int(datetime.utcnow().timestamp() + 30 * 60),
    )

    appointment.stripe_checkout_session_id = checkout_session.id
    appointment.stripe_payment_intent_id = checkout_session.payment_intent
    appointment.updated_at = datetime.utcnow()
    session.add(appointment)
    await session.flush()

    logger.info("Created Checkout Session %s for appointment %s", checkout_session.id, appointment_id)
    return checkout_session


# ---------------------------------------------------------------------------
# Webhook verification & routing
# ---------------------------------------------------------------------------


def verify_stripe_signature(raw_body: bytes, sig_header: str) -> stripe.Event:
    """
    Validate the HMAC-SHA256 signature on a Stripe webhook payload.
    MUST receive raw bytes — never a re-serialised JSON body.
    """
    if not sig_header:
        raise ValueError("Missing Stripe-Signature header.")
    return stripe.Webhook.construct_event(
        payload=raw_body,
        sig_header=sig_header,
        secret=settings.stripe_webhook_secret,
    )


async def handle_webhook_event(session: AsyncSession, event: stripe.Event) -> dict:
    handlers = {
        "checkout.session.completed": _handle_checkout_completed,
        "payment_intent.succeeded": _handle_payment_intent_succeeded,
    }
    handler = handlers.get(event["type"])
    if handler is None:
        logger.debug("Unhandled Stripe event type: %s", event["type"])
        return {"status": "ignored", "event_type": event["type"]}
    return await handler(session, event["data"]["object"])


# ---------------------------------------------------------------------------
# Event handlers
# ---------------------------------------------------------------------------


async def _handle_checkout_completed(session: AsyncSession, checkout_session: dict) -> dict:
    appointment_id_str = (checkout_session.get("metadata") or {}).get("appointment_id")
    if not appointment_id_str:
        logger.error("checkout.session.completed missing metadata.appointment_id")
        return {"status": "error", "reason": "missing appointment_id in metadata"}

    return await _mark_appointment_paid(
        session=session,
        appointment_id=UUID(appointment_id_str),
        payment_intent_id=checkout_session.get("payment_intent"),
        stripe_session_id=checkout_session.get("id"),
    )


async def _handle_payment_intent_succeeded(session: AsyncSession, payment_intent: dict) -> dict:
    pi_id = payment_intent.get("id")
    if not pi_id:
        return {"status": "error", "reason": "missing PaymentIntent id"}

    result = await session.execute(
        select(Appointment).where(Appointment.stripe_payment_intent_id == pi_id)
    )
    appointment = result.scalar_one_or_none()
    if appointment is None:
        logger.warning("payment_intent.succeeded for unknown PI %s", pi_id)
        return {"status": "ignored", "reason": "no appointment linked to this PI"}

    return await _mark_appointment_paid(
        session=session,
        appointment_id=appointment.id,
        payment_intent_id=pi_id,
        stripe_session_id=None,
    )


async def _mark_appointment_paid(
    session: AsyncSession,
    appointment_id: UUID,
    payment_intent_id: str | None,
    stripe_session_id: str | None,
) -> dict:
    """Atomically mark appointment as paid. Idempotent."""
    result = await session.execute(
        select(Appointment).where(Appointment.id == appointment_id).with_for_update()
    )
    appointment = result.scalar_one_or_none()
    if appointment is None:
        return {"status": "error", "reason": f"appointment {appointment_id} not found"}

    if appointment.status == AppointmentStatus.paid:
        logger.info("Appointment %s already paid — idempotent skip.", appointment_id)
        return {"status": "already_paid", "appointment_id": str(appointment_id)}

    appointment.status = AppointmentStatus.paid
    appointment.paid_at = datetime.utcnow()
    appointment.updated_at = datetime.utcnow()
    if payment_intent_id:
        appointment.stripe_payment_intent_id = payment_intent_id
    if stripe_session_id:
        appointment.stripe_checkout_session_id = stripe_session_id

    session.add(appointment)
    await session.flush()

    await provision_room_after_payment(db_session=session, appointment=appointment)
    await session.refresh(appointment)

    # Notificações assíncronas (não bloqueiam webhook)
    patient = (
        await session.execute(select(User).where(User.id == appointment.patient_id))
    ).scalar_one_or_none()
    try:
        await notify_payment_confirmed(session, appointment, patient)
    except Exception:
        logger.exception("Falha ao enviar notificação de pagamento confirmado.")
    try:
        starts_at = (
            appointment.scheduled_at
            if appointment.scheduled_at.tzinfo
            else appointment.scheduled_at.replace(tzinfo=timezone.utc)
        )
        schedule_session_reminder(appointment.id, starts_at)
    except Exception:
        logger.exception("Falha ao agendar lembrete de 15 minutos.")

    logger.info("Appointment %s marked as PAID (PI=%s).", appointment_id, payment_intent_id)
    return {"status": "paid", "appointment_id": str(appointment_id)}
