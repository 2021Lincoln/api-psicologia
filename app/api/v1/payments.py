"""
app/api/v1/payments.py
-----------------------
POST /api/v1/payments/checkout  — Checkout Session Stripe
POST /api/v1/payments/webhook   — Webhook Stripe (assinatura verificada)
"""

from __future__ import annotations

import logging
from datetime import datetime
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.db.session import get_session
from app.models.domain import Appointment, AppointmentStatus, PsychologistProfile, User
from app.services.video import create_mock_room
from app.services.payment import (
    AppointmentNotFound,
    PaymentAlreadyProcessed,
    create_checkout_session,
    handle_webhook_event,
    verify_stripe_signature,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["Payments"])


class CheckoutRequest(BaseModel):
    appointment_id: UUID
    customer_email: str


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


@router.post(
    "/checkout",
    response_model=CheckoutResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Iniciar pagamento de uma sessão",
)
async def create_checkout(
    body: CheckoutRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_session),
) -> CheckoutResponse:
    """Cria ou reutiliza uma Stripe Checkout Session para o agendamento do usuário autenticado."""
    appt = (await db.execute(
        select(Appointment).where(Appointment.id == body.appointment_id)
    )).scalar_one_or_none()
    if appt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Agendamento não encontrado.")

    profile = (await db.execute(
        select(PsychologistProfile).where(PsychologistProfile.id == appt.psychologist_profile_id)
    )).scalar_one_or_none()
    owner_id = profile.user_id if profile else None

    if current_user.id not in (appt.patient_id, owner_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            detail="Apenas paciente ou psicóloga podem iniciar o pagamento.")
    if appt.status == AppointmentStatus.cancelled:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Agendamento cancelado.")

    try:
        stripe_session = await create_checkout_session(
            session=db,
            appointment_id=body.appointment_id,
            customer_email=body.customer_email,
        )
        await db.commit()
    except AppointmentNotFound as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))
    except PaymentAlreadyProcessed as e:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(e))
    except stripe.error.StripeError as e:
        logger.exception("Stripe error on checkout")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            detail=f"Erro no gateway de pagamento: {e.user_message}")

    return CheckoutResponse(checkout_url=stripe_session.url, session_id=stripe_session.id)


class MockPayRequest(BaseModel):
    appointment_id: UUID


class MockPayResponse(BaseModel):
    appointment_id: str
    status: str
    daily_room_url: str


@router.post(
    "/mock-pay",
    response_model=MockPayResponse,
    summary="Simula pagamento para testes (sem Stripe)",
)
async def mock_pay(
    body: MockPayRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_session),
) -> MockPayResponse:
    """Marca agendamento como pago e cria sala Jitsi Meet para testes — sem cobrar nada."""
    appt = (
        await db.execute(
            select(Appointment).where(Appointment.id == body.appointment_id).with_for_update()
        )
    ).scalar_one_or_none()

    if appt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Agendamento não encontrado.")

    profile = (await db.execute(
        select(PsychologistProfile).where(PsychologistProfile.id == appt.psychologist_profile_id)
    )).scalar_one_or_none()
    owner_id = profile.user_id if profile else None

    if current_user.id not in (appt.patient_id, owner_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Acesso negado.")
    if appt.status == AppointmentStatus.cancelled:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Agendamento cancelado.")

    # Idempotente: já pago → retorna dados existentes
    if appt.status == AppointmentStatus.paid:
        return MockPayResponse(
            appointment_id=str(appt.id),
            status="paid",
            daily_room_url=appt.daily_room_url or "",
        )

    psych_user = (await db.execute(
        select(User).where(User.id == profile.user_id)
    )).scalar_one_or_none() if profile else None
    psych_name = psych_user.full_name if psych_user else None

    room_url, room_name = await create_mock_room(appt, psychologist_name=psych_name)

    appt.status = AppointmentStatus.paid
    appt.paid_at = datetime.utcnow()
    appt.updated_at = datetime.utcnow()
    appt.daily_room_name = room_name
    appt.daily_room_url = room_url
    db.add(appt)
    await db.commit()

    logger.info("Mock pay: appointment %s marked as PAID, room %s", appt.id, room_url)
    return MockPayResponse(
        appointment_id=str(appt.id),
        status="paid",
        daily_room_url=room_url,
    )


@router.post(
    "/webhook",
    status_code=status.HTTP_200_OK,
    include_in_schema=False,  # não expõe no Swagger
)
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_session),
    stripe_signature: str | None = Header(default=None, alias="stripe-signature"),
) -> dict:
    """Processa webhooks da Stripe com verificação HMAC-SHA256; sempre responde 200."""
    raw_body = await request.body()  # bytes brutos — nunca parsear antes de verificar

    try:
        event = verify_stripe_signature(raw_body=raw_body, sig_header=stripe_signature or "")
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Stripe-Signature ausente.")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Assinatura inválida.")

    try:
        result = await handle_webhook_event(session=db, event=event)
        await db.commit()
    except Exception:
        logger.exception("Falha ao processar evento Stripe %s", event.get("id"))
        return {"status": "error", "event_id": event.get("id")}

    return {"status": "ok", "event_id": event.get("id"), "result": result}
