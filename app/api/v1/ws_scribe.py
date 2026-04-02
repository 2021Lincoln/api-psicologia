"""
app/api/v1/ws_scribe.py
-----------------------
WebSocket — Scribe clínico ao vivo (inspirado no Suki/DAX).

Fluxo:
  1. Psicóloga abre a aba "Scribe ao Vivo" na sessão
  2. Browser captura o microfone via MediaRecorder
  3. Chunks de áudio (~8s) são enviados via WebSocket binário
  4. Whisper (local) transcreve cada chunk
  5. Claude Haiku analisa a cada ~120 novas palavras e atualiza o painel clínico

Conectar: ws://<host>/api/v1/ws/appointments/{id}/scribe?token=<access_token>

Eventos enviados ao client (JSON):
  {"type": "transcript",  "delta": "texto novo"}
  {"type": "analysis",    "data": {emotional_state, main_themes, risk_level, ...}}
  {"type": "error",       "message": "..."}
  {"type": "ping"}

Eventos recebidos do client (JSON text ou binary):
  binary → chunk de áudio webm/opus
  {"type": "stop"}   → encerra e salva
  {"type": "flush"}  → força processamento do buffer restante
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlmodel import select

from app.core.security import TokenError, decode_token
from app.db.session import AsyncSessionLocal
from app.models.domain import (
    Appointment,
    PsychologistProfile,
    SessionTranscript,
    TranscriptStatus,
    User,
    UserRole,
)
from app.services.clinical_ai import live_analysis
from app.services.transcription import transcribe_bytes_sync

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Live Scribe"])

# ── Configurações do scribe ───────────────────────────────────────────────────
_MIN_AUDIO_BYTES = 28_000        # ~3-4 s de webm/opus antes de transcrever
_ANALYSIS_WORD_THRESHOLD = 120   # Analisa a cada N novas palavras


# ── Endpoint WebSocket ────────────────────────────────────────────────────────


@router.websocket("/ws/appointments/{appointment_id}/scribe")
async def live_scribe_ws(
    websocket: WebSocket,
    appointment_id: UUID,
    token: str = Query(..., description="JWT access token"),
) -> None:
    """WebSocket para scribe clínico ao vivo."""

    # ── Autenticação e autorização ──────────────────────────────────────────
    user = await _authenticate_ws(token, appointment_id)
    if user is None:
        await websocket.close(code=4001, reason="Token inválido ou acesso negado.")
        return

    await websocket.accept()
    logger.info("Live scribe iniciado: appointment=%s user=%s", appointment_id, user.id)

    audio_buffer = bytearray()
    full_transcript = ""
    last_analysis_word_count = 0

    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive(), timeout=90.0)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
                continue

            # ── Chunk de áudio (binário) ────────────────────────────────────
            if msg.get("bytes"):
                audio_buffer.extend(msg["bytes"])

                if len(audio_buffer) >= _MIN_AUDIO_BYTES:
                    chunk = bytes(audio_buffer)
                    audio_buffer.clear()
                    full_transcript = await _process_audio_chunk(
                        websocket, chunk, full_transcript
                    )

            # ── Mensagem de controle (texto JSON) ───────────────────────────
            elif msg.get("text"):
                try:
                    ctrl = json.loads(msg["text"])
                except Exception:
                    continue

                if ctrl.get("type") == "stop":
                    # Processa buffer restante antes de encerrar
                    if audio_buffer:
                        chunk = bytes(audio_buffer)
                        audio_buffer.clear()
                        full_transcript = await _process_audio_chunk(
                            websocket, chunk, full_transcript
                        )
                    break

                if ctrl.get("type") == "flush" and audio_buffer:
                    chunk = bytes(audio_buffer)
                    audio_buffer.clear()
                    full_transcript = await _process_audio_chunk(
                        websocket, chunk, full_transcript
                    )

            # ── Análise periódica com Ollama ────────────────────────────────
            current_words = len(full_transcript.split())
            if (
                current_words - last_analysis_word_count >= _ANALYSIS_WORD_THRESHOLD
                and full_transcript.strip()
            ):
                last_analysis_word_count = current_words
                try:
                    analysis = await live_analysis(full_transcript)
                    if analysis:
                        await websocket.send_json({"type": "analysis", "data": analysis})
                except Exception as e:
                    logger.warning("Análise ao vivo falhou: %s", e)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("Erro no live scribe: %s", e)
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        # Salva transcrição no banco se tiver conteúdo suficiente
        if len(full_transcript.split()) > 15:
            await _save_live_transcript(appointment_id, full_transcript)
        logger.info("Live scribe encerrado: appointment=%s", appointment_id)


# ── Helpers internos ──────────────────────────────────────────────────────────


async def _authenticate_ws(token: str, appointment_id: UUID) -> User | None:
    """Valida JWT e verifica que o usuário é a psicóloga do agendamento."""
    try:
        payload = decode_token(token, expected_type="access")
        user_id = UUID(payload["sub"])
    except (TokenError, ValueError, KeyError):
        return None

    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if user is None or not user.is_active or user.role != UserRole.psychologist:
            return None

        profile = (
            await db.execute(
                select(PsychologistProfile).where(PsychologistProfile.user_id == user_id)
            )
        ).scalar_one_or_none()
        if profile is None:
            return None

        appt = (
            await db.execute(select(Appointment).where(Appointment.id == appointment_id))
        ).scalar_one_or_none()
        if appt is None or appt.psychologist_profile_id != profile.id:
            return None

    return user


async def _process_audio_chunk(
    websocket: WebSocket,
    chunk: bytes,
    full_transcript: str,
) -> str:
    """Transcreve um chunk de áudio e envia o delta ao cliente."""
    try:
        segments = await asyncio.to_thread(transcribe_bytes_sync, chunk, ".webm")
        if not segments:
            return full_transcript

        delta = " ".join(s["text"] for s in segments if s["text"].strip())
        if delta.strip():
            full_transcript += f"\n{delta.strip()}"
            await websocket.send_json({"type": "transcript", "delta": delta.strip()})
    except Exception as e:
        logger.warning("Erro Whisper no chunk: %s", e)

    return full_transcript



async def _save_live_transcript(appointment_id: UUID, full_text: str) -> None:
    """Persiste a transcrição ao vivo no banco (upsert)."""
    import json as _json

    from app.services.transcription import _build_full_text, _run_whisper_sync  # noqa

    async with AsyncSessionLocal() as db:
        existing = (
            await db.execute(
                select(SessionTranscript).where(
                    SessionTranscript.appointment_id == appointment_id
                )
            )
        ).scalar_one_or_none()

        transcript = existing or SessionTranscript(appointment_id=appointment_id)
        transcript.full_text = full_text.strip()
        transcript.segments = _json.dumps([], ensure_ascii=False)  # live = sem segmentos individuais
        transcript.language = "pt-BR"
        transcript.word_count = len(full_text.split())
        transcript.status = TranscriptStatus.done
        transcript.transcribed_at = datetime.utcnow()
        transcript.updated_at = datetime.utcnow()
        db.add(transcript)
        await db.commit()

    logger.info(
        "Transcrição ao vivo salva: appointment=%s %d palavras",
        appointment_id,
        len(full_text.split()),
    )
