"""
app/api/v1/transcripts.py
--------------------------
Endpoints de transcrição clínica e prontuário digital.
Acesso restrito à psicóloga do agendamento.

Rotas:
  POST /api/v1/video/webhook                          — Daily.co webhook
  GET  /api/v1/appointments/{id}/transcript           — Ver transcrição
  GET  /api/v1/appointments/{id}/summary              — Ver prontuário
  PUT  /api/v1/appointments/{id}/summary              — Editar prontuário
  POST /api/v1/appointments/{id}/summary/regenerate   — Regerar com IA
  GET  /api/v1/psychologists/me/patients              — Lista de pacientes
  GET  /api/v1/psychologists/me/patients/{pid}        — Histórico do paciente
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Header, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.api.deps import CurrentUser
from app.core.config import settings
from app.db.session import AsyncSessionLocal, get_session
from app.models.domain import (
    Appointment,
    AppointmentStatus,
    PsychologistProfile,
    RecordingStatus,
    RiskLevel,
    SessionRecording,
    SessionSummary,
    SessionTranscript,
    TranscriptStatus,
    User,
)
import os

from app.services.clinical_ai import generate_clinical_summary
from app.services.transcription import run_transcription_pipeline, run_transcription_pipeline_from_file

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Transcripts & Prontuário"])


# ---------------------------------------------------------------------------
# Schemas de resposta
# ---------------------------------------------------------------------------


class TranscriptSegment(BaseModel):
    speaker: str
    text: str
    start_ms: int
    end_ms: int


class TranscriptResponse(BaseModel):
    appointment_id: UUID
    status: str
    full_text: Optional[str]
    segments: list[TranscriptSegment]
    word_count: int
    transcribed_at: Optional[datetime]


class SummaryResponse(BaseModel):
    appointment_id: UUID
    chief_complaint: Optional[str]
    mental_status: Optional[str]
    diagnostic_hypotheses: Optional[str]
    interventions: Optional[str]
    session_content: Optional[str]
    patient_evolution: Optional[str]
    therapeutic_plan: Optional[str]
    next_steps: Optional[str]
    risk_level: str
    additional_notes: Optional[str]
    ai_model_used: Optional[str]
    ai_generated_at: Optional[datetime]
    last_edited_at: Optional[datetime]


class SummaryUpdate(BaseModel):
    chief_complaint: Optional[str] = None
    mental_status: Optional[str] = None
    diagnostic_hypotheses: Optional[str] = None
    interventions: Optional[str] = None
    session_content: Optional[str] = None
    patient_evolution: Optional[str] = None
    therapeutic_plan: Optional[str] = None
    next_steps: Optional[str] = None
    risk_level: Optional[str] = None
    additional_notes: Optional[str] = None


class PatientBrief(BaseModel):
    patient_id: UUID
    full_name: str
    email: str
    avatar_url: Optional[str]
    session_count: int
    last_session_at: Optional[datetime]


class PatientSessionItem(BaseModel):
    appointment_id: UUID
    scheduled_at: datetime
    duration_minutes: int
    status: str
    has_transcript: bool
    has_summary: bool
    risk_level: Optional[str]


# ---------------------------------------------------------------------------
# Daily.co Webhook
# ---------------------------------------------------------------------------


@router.post(
    "/video/webhook",
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
async def daily_webhook(
    request: Request,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_session),
    daily_webhook_signature: Optional[str] = Header(default=None, alias="x-daily-signature"),
) -> dict:
    """
    Processa eventos do Daily.co.
    Eventos tratados:
    - recording.ready   → cria SessionRecording e inicia transcrição
    - recording.started → cria SessionRecording com status pending
    - recording.error   → atualiza status de erro
    """
    raw_body = await request.body()

    # Validação de assinatura HMAC (opcional se secret configurado)
    if settings.daily_webhook_hmac_secret:
        mac = hmac.new(settings.daily_webhook_hmac_secret.encode(), raw_body, hashlib.sha256)  # type: ignore[attr-defined]
        expected = mac.hexdigest()
        if not hmac.compare_digest(f"sha256={expected}", daily_webhook_signature or ""):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Assinatura inválida.")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Payload inválido.")

    event_type = payload.get("action") or payload.get("type", "")
    props = payload.get("payload", {})

    logger.info("Daily.co webhook: %s", event_type)

    if event_type == "recording.ready":
        await _handle_recording_ready(db, background, props)

    elif event_type == "recording.started":
        await _handle_recording_started(db, props)

    elif event_type in ("recording.error", "recording.stopped-with-error"):
        await _handle_recording_error(db, props)

    return {"status": "ok"}


async def _find_appointment_by_room(db: AsyncSession, room_name: str | None) -> UUID | None:
    """Busca appointment pelo nome da sala Daily.co.

    Suporta tanto 'psico-{uuid}' quanto 'mock-{16chars}' — consulta o banco
    pelo campo daily_room_name para evitar falhas de parse de UUID.
    """
    if not room_name:
        return None
    # Otimização: formato psico-{uuid} pode ser parseado diretamente
    if room_name.startswith("psico-"):
        try:
            return UUID(room_name[len("psico-"):])
        except ValueError:
            pass
    # Fallback: busca no banco (cobre mock-{16chars} e qualquer outro formato)
    appt_id = (
        await db.execute(
            select(Appointment.id).where(Appointment.daily_room_name == room_name)  # type: ignore[arg-type]
        )
    ).scalar_one_or_none()
    return appt_id


async def _handle_recording_ready(
    db: AsyncSession,
    background: BackgroundTasks,
    props: dict,
) -> None:
    room_name: str = props.get("roomName", "")
    recording_id: str = props.get("recordingId", "")
    recording_url: str = props.get("downloadUrl", "") or props.get("s3Key", "")
    duration: int = props.get("duration", 0)

    appt_id = await _find_appointment_by_room(db, room_name)
    if appt_id is None:
        logger.warning("recording.ready: room_name inválido '%s'", room_name)
        return

    existing = (
        await db.execute(
            select(SessionRecording).where(SessionRecording.appointment_id == appt_id)
        )
    ).scalar_one_or_none()

    rec = existing or SessionRecording(appointment_id=appt_id)
    rec.daily_recording_id = recording_id
    rec.recording_url = recording_url
    rec.duration_seconds = duration
    rec.status = RecordingStatus.pending
    rec.updated_at = datetime.utcnow()
    db.add(rec)
    await db.commit()
    await db.refresh(rec)

    # Inicia pipeline em background com sessão própria (request-scoped db fecha logo)
    background.add_task(_bg_transcribe_and_summarize, appt_id)


async def _handle_recording_started(db: AsyncSession, props: dict) -> None:
    room_name: str = props.get("roomName", "")
    appt_id = await _find_appointment_by_room(db, room_name)
    if appt_id is None:
        return
    existing = (
        await db.execute(
            select(SessionRecording).where(SessionRecording.appointment_id == appt_id)
        )
    ).scalar_one_or_none()
    if not existing:
        rec = SessionRecording(
            appointment_id=appt_id,
            status=RecordingStatus.pending,
        )
        db.add(rec)
        await db.commit()


async def _handle_recording_error(db: AsyncSession, props: dict) -> None:
    room_name: str = props.get("roomName", "")
    appt_id = await _find_appointment_by_room(db, room_name)
    if appt_id is None:
        return
    rec = (
        await db.execute(
            select(SessionRecording).where(SessionRecording.appointment_id == appt_id)
        )
    ).scalar_one_or_none()
    if rec:
        rec.status = RecordingStatus.error
        rec.error_message = props.get("error", "Erro desconhecido")[:500]
        rec.updated_at = datetime.utcnow()
        db.add(rec)
        await db.commit()


async def _bg_transcribe_and_summarize(appt_id: UUID) -> None:
    """Background task: transcreve gravação e gera prontuário clínico.

    Cria suas próprias sessões de banco — a sessão do request já foi fechada
    quando esta função executa.
    """
    import asyncio

    # 1. Transcrição
    async with AsyncSessionLocal() as db:
        await run_transcription_pipeline(db, appt_id)

    # 2. Aguarda transcrição concluída (até 5 min) e então gera prontuário
    for _ in range(60):
        async with AsyncSessionLocal() as db:
            transcript = (
                await db.execute(
                    select(SessionTranscript).where(
                        SessionTranscript.appointment_id == appt_id
                    )
                )
            ).scalar_one_or_none()

        if transcript and transcript.status == TranscriptStatus.done:
            async with AsyncSessionLocal() as db:
                await generate_clinical_summary(db, appt_id)
            return

        if transcript and transcript.status == TranscriptStatus.failed:
            logger.error("Transcrição falhou para %s — prontuário cancelado.", appt_id)
            return

        await asyncio.sleep(5)

    logger.warning("Timeout aguardando transcrição para %s.", appt_id)


async def _bg_generate_summary(appt_id: UUID) -> None:
    """Background task: regenera prontuário clínico com sessão própria."""
    async with AsyncSessionLocal() as db:
        await generate_clinical_summary(db, appt_id, force=True)


# ---------------------------------------------------------------------------
# Transcrição
# ---------------------------------------------------------------------------


@router.get(
    "/appointments/{appointment_id}/transcript",
    response_model=TranscriptResponse,
    summary="Transcrição da sessão (somente psicóloga)",
)
async def get_transcript(
    appointment_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_session),
) -> TranscriptResponse:
    await _assert_psychologist_owns(db, appointment_id, current_user.id)

    transcript = (
        await db.execute(
            select(SessionTranscript).where(
                SessionTranscript.appointment_id == appointment_id
            )
        )
    ).scalar_one_or_none()

    if transcript is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail="Transcrição ainda não disponível para esta sessão.",
        )

    segs: list[TranscriptSegment] = []
    try:
        raw = json.loads(transcript.segments or "[]")
        segs = [TranscriptSegment(**s) for s in raw]
    except Exception:
        pass

    return TranscriptResponse(
        appointment_id=appointment_id,
        status=transcript.status,
        full_text=transcript.full_text,
        segments=segs,
        word_count=transcript.word_count,
        transcribed_at=transcript.transcribed_at,
    )


# ---------------------------------------------------------------------------
# Prontuário (summary)
# ---------------------------------------------------------------------------


@router.get(
    "/appointments/{appointment_id}/summary",
    response_model=SummaryResponse,
    summary="Prontuário clínico da sessão (somente psicóloga)",
)
async def get_summary(
    appointment_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_session),
) -> SummaryResponse:
    await _assert_psychologist_owns(db, appointment_id, current_user.id)

    summary = (
        await db.execute(
            select(SessionSummary).where(SessionSummary.appointment_id == appointment_id)
        )
    ).scalar_one_or_none()

    if summary is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail="Prontuário ainda não gerado para esta sessão.",
        )

    return _summary_to_response(summary)


@router.put(
    "/appointments/{appointment_id}/summary",
    response_model=SummaryResponse,
    summary="Editar prontuário clínico (somente psicóloga)",
)
async def update_summary(
    appointment_id: UUID,
    body: SummaryUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_session),
) -> SummaryResponse:
    await _assert_psychologist_owns(db, appointment_id, current_user.id)

    summary = (
        await db.execute(
            select(SessionSummary).where(SessionSummary.appointment_id == appointment_id)
        )
    ).scalar_one_or_none()

    if summary is None:
        # Cria prontuário vazio caso ainda não exista
        summary = SessionSummary(appointment_id=appointment_id)

    for field, value in body.model_dump(exclude_none=True).items():
        if field == "risk_level" and value:
            try:
                value = RiskLevel(value)
            except ValueError:
                value = RiskLevel.low
        setattr(summary, field, value)

    summary.last_edited_by = current_user.id
    summary.last_edited_at = datetime.utcnow()
    summary.updated_at = datetime.utcnow()
    db.add(summary)
    await db.commit()
    await db.refresh(summary)

    return _summary_to_response(summary)


@router.post(
    "/appointments/{appointment_id}/summary/regenerate",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Regerar prontuário com IA (somente psicóloga)",
)
async def regenerate_summary(
    appointment_id: UUID,
    current_user: CurrentUser,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_session),
) -> dict:
    await _assert_psychologist_owns(db, appointment_id, current_user.id)

    transcript = (
        await db.execute(
            select(SessionTranscript).where(
                SessionTranscript.appointment_id == appointment_id
            )
        )
    ).scalar_one_or_none()

    if transcript is None or transcript.status != TranscriptStatus.done:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Transcrição ainda não concluída. Aguarde o processamento.",
        )

    background.add_task(_bg_generate_summary, appointment_id)
    return {"status": "processing", "message": "Prontuário sendo regerado em background."}


@router.post(
    "/appointments/{appointment_id}/transcript/retry",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Reprocessar transcrição manualmente (somente psicóloga)",
)
async def retry_transcription(
    appointment_id: UUID,
    current_user: CurrentUser,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Relança o pipeline de transcrição caso o webhook Daily.co tenha falhado."""
    await _assert_psychologist_owns(db, appointment_id, current_user.id)

    recording = (
        await db.execute(
            select(SessionRecording).where(SessionRecording.appointment_id == appointment_id)
        )
    ).scalar_one_or_none()

    if recording is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail="Nenhuma gravação encontrada. O Daily.co ainda não enviou o webhook.",
        )
    if recording.status in (RecordingStatus.downloading, RecordingStatus.transcribing):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Transcrição já está em andamento.",
        )

    # Reseta status para permitir reprocessamento
    recording.status = RecordingStatus.pending
    recording.error_message = None
    recording.updated_at = datetime.utcnow()
    db.add(recording)
    await db.commit()

    background.add_task(_bg_transcribe_and_summarize, appointment_id)
    return {"status": "processing", "message": "Transcrição iniciada em background."}


@router.get(
    "/appointments/{appointment_id}/processing-status",
    summary="Status de processamento da sessão (somente psicóloga)",
)
async def processing_status(
    appointment_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Retorna o estado atual da gravação, transcrição e prontuário."""
    await _assert_psychologist_owns(db, appointment_id, current_user.id)

    recording = (
        await db.execute(
            select(SessionRecording).where(SessionRecording.appointment_id == appointment_id)
        )
    ).scalar_one_or_none()

    transcript = (
        await db.execute(
            select(SessionTranscript).where(SessionTranscript.appointment_id == appointment_id)
        )
    ).scalar_one_or_none()

    summary = (
        await db.execute(
            select(SessionSummary).where(SessionSummary.appointment_id == appointment_id)
        )
    ).scalar_one_or_none()

    return {
        "appointment_id": appointment_id,
        "recording": {
            "status": recording.status if recording else "not_started",
            "error": recording.error_message if recording else None,
        },
        "transcript": {
            "status": transcript.status if transcript else "not_started",
            "word_count": transcript.word_count if transcript else 0,
        },
        "summary": {
            "status": "done" if summary else "not_started",
            "ai_generated_at": summary.ai_generated_at if summary else None,
            "last_edited_at": summary.last_edited_at if summary else None,
        },
    }


# ---------------------------------------------------------------------------
# Upload manual de áudio para transcrição
# ---------------------------------------------------------------------------

_ALLOWED_AUDIO_TYPES = {
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav",
    "audio/ogg", "audio/webm", "video/webm", "video/mp4", "audio/mp4",
    "audio/m4a", "audio/x-m4a", "audio/flac", "audio/x-flac",
}
_RECORDINGS_DIR = "static/recordings"
_MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB


@router.post(
    "/appointments/{appointment_id}/transcript/upload",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload de áudio/vídeo para transcrição manual (somente psicóloga)",
)
async def upload_audio_for_transcription(
    appointment_id: UUID,
    current_user: CurrentUser,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_session),
    file: UploadFile = File(...),
) -> dict:
    """Aceita MP3, WAV, OGG, WEBM, MP4, M4A ou FLAC (máx 500 MB).
    Transcreve localmente com Whisper e gera o prontuário em background.
    """
    await _assert_psychologist_owns(db, appointment_id, current_user.id)

    ct = file.content_type or ""
    if ct not in _ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Formato não suportado. Use MP3, WAV, OGG, WEBM, MP4, M4A ou FLAC.",
        )

    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Arquivo muito grande. Máximo: 500 MB.",
        )

    os.makedirs(_RECORDINGS_DIR, exist_ok=True)
    ext = (file.filename or "audio").rsplit(".", 1)[-1].lower() or "mp3"
    save_path = os.path.join(_RECORDINGS_DIR, f"{appointment_id}.{ext}")
    with open(save_path, "wb") as f:
        f.write(data)

    background.add_task(_bg_transcribe_from_file, appointment_id, save_path)
    return {
        "status": "processing",
        "message": "Áudio recebido. Transcrição iniciada — pode levar alguns minutos.",
    }


async def _bg_transcribe_from_file(appt_id: UUID, file_path: str) -> None:
    """Background task: transcreve arquivo local e gera prontuário clínico."""
    async with AsyncSessionLocal() as db:
        await run_transcription_pipeline_from_file(db, appt_id, file_path)

    # Remove arquivo após transcrição
    try:
        os.unlink(file_path)
    except OSError:
        pass

    # Gera prontuário se a transcrição concluiu
    async with AsyncSessionLocal() as db:
        transcript = (
            await db.execute(
                select(SessionTranscript).where(SessionTranscript.appointment_id == appt_id)
            )
        ).scalar_one_or_none()
        if transcript and transcript.status == TranscriptStatus.done:
            await generate_clinical_summary(db, appt_id)


# ---------------------------------------------------------------------------
# Pacientes da psicóloga
# ---------------------------------------------------------------------------


@router.get(
    "/psychologists/me/patients",
    response_model=list[PatientBrief],
    summary="Lista de pacientes atendidos (somente psicóloga)",
)
async def list_my_patients(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_session),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[PatientBrief]:
    if current_user.role != "psychologist":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Acesso restrito a psicólogas.")

    profile = (
        await db.execute(
            select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id)
        )
    ).scalar_one_or_none()

    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Perfil não encontrado.")

    appointments = (
        await db.execute(
            select(Appointment).where(
                Appointment.psychologist_profile_id == profile.id,
                Appointment.status == AppointmentStatus.paid,
            ).order_by(Appointment.scheduled_at.desc())
        )
    ).scalars().all()

    # Agrupa por paciente
    from collections import defaultdict

    patient_data: dict[UUID, dict] = defaultdict(
        lambda: {"session_count": 0, "last_session_at": None}
    )
    patient_ids: set[UUID] = set()

    for appt in appointments:
        pid = appt.patient_id
        patient_ids.add(pid)
        patient_data[pid]["session_count"] += 1
        sat = appt.scheduled_at
        if (
            patient_data[pid]["last_session_at"] is None
            or sat > patient_data[pid]["last_session_at"]
        ):
            patient_data[pid]["last_session_at"] = sat

    if not patient_ids:
        return []

    users = (
        await db.execute(select(User).where(User.id.in_(patient_ids)))  # type: ignore[attr-defined]
    ).scalars().all()

    result: list[PatientBrief] = []
    for u in users:
        d = patient_data[u.id]
        result.append(
            PatientBrief(
                patient_id=u.id,
                full_name=u.full_name,
                email=u.email,
                avatar_url=u.avatar_url,
                session_count=d["session_count"],
                last_session_at=d["last_session_at"],
            )
        )

    result.sort(key=lambda x: x.last_session_at or datetime.min, reverse=True)
    return result[offset : offset + limit]


@router.get(
    "/psychologists/me/patients/{patient_id}",
    response_model=list[PatientSessionItem],
    summary="Histórico de sessões de um paciente (somente psicóloga)",
)
async def patient_history(
    patient_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_session),
) -> list[PatientSessionItem]:
    if current_user.role != "psychologist":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Acesso restrito a psicólogas.")

    profile = (
        await db.execute(
            select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id)
        )
    ).scalar_one_or_none()

    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Perfil não encontrado.")

    appointments = (
        await db.execute(
            select(Appointment).where(
                Appointment.psychologist_profile_id == profile.id,
                Appointment.patient_id == patient_id,
            ).order_by(Appointment.scheduled_at.desc())  # type: ignore[attr-defined]
        )
    ).scalars().all()

    if not appointments:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Nenhuma sessão encontrada.")

    result: list[PatientSessionItem] = []
    for appt in appointments:
        appt_id = appt.id

        has_transcript = (
            await db.execute(
                select(SessionTranscript.id).where(
                    SessionTranscript.appointment_id == appt_id,
                    SessionTranscript.status == TranscriptStatus.done,
                )
            )
        ).scalar_one_or_none() is not None

        summary = (
            await db.execute(
                select(SessionSummary).where(SessionSummary.appointment_id == appt_id)
            )
        ).scalar_one_or_none()

        result.append(
            PatientSessionItem(
                appointment_id=appt_id,
                scheduled_at=appt.scheduled_at,
                duration_minutes=appt.duration_minutes,
                status=appt.status,
                has_transcript=has_transcript,
                has_summary=summary is not None,
                risk_level=summary.risk_level if summary else None,
            )
        )

    return result


# ---------------------------------------------------------------------------
# Helpers de autorização
# ---------------------------------------------------------------------------


async def _assert_psychologist_owns(
    db: AsyncSession,
    appointment_id: UUID,
    user_id: UUID,
) -> None:
    """Lança 403 se o usuário não for a psicóloga do agendamento."""
    appt = (
        await db.execute(select(Appointment).where(Appointment.id == appointment_id))
    ).scalar_one_or_none()

    if appt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Agendamento não encontrado.")

    profile = (
        await db.execute(
            select(PsychologistProfile).where(
                PsychologistProfile.id == appt.psychologist_profile_id
            )
        )
    ).scalar_one_or_none()

    if profile is None or profile.user_id != user_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito à psicóloga responsável pela sessão.",
        )


def _summary_to_response(s: SessionSummary) -> SummaryResponse:
    return SummaryResponse(
        appointment_id=s.appointment_id,
        chief_complaint=s.chief_complaint,
        mental_status=s.mental_status,
        diagnostic_hypotheses=s.diagnostic_hypotheses,
        interventions=s.interventions,
        session_content=s.session_content,
        patient_evolution=s.patient_evolution,
        therapeutic_plan=s.therapeutic_plan,
        next_steps=s.next_steps,
        risk_level=s.risk_level,
        additional_notes=s.additional_notes,
        ai_model_used=s.ai_model_used,
        ai_generated_at=s.ai_generated_at,
        last_edited_at=s.last_edited_at,
    )
