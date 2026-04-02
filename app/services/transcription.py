"""
app/services/transcription.py
------------------------------
Pipeline de transcrição: baixa a gravação do Daily.co e transcreve localmente
com faster-whisper (Whisper Large V3 rodando no próprio servidor — 100% LGPD).
Atualiza SessionRecording e persiste SessionTranscript no banco.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

import httpx  # noqa: F401 — usado em _download_recording
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

if TYPE_CHECKING:
    from faster_whisper import WhisperModel as _WhisperModel

from app.core.config import settings
from app.models.domain import (
    Appointment,
    RecordingStatus,
    SessionRecording,
    SessionTranscript,
    TranscriptStatus,
)

logger = logging.getLogger(__name__)

# Singleton do modelo — carregado na primeira transcrição e reutilizado
_whisper_model: "_WhisperModel | None" = None


def _get_whisper_model() -> "_WhisperModel":
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel  # lazy import — evita tempo de carga no startup

        logger.info("Carregando modelo Whisper '%s' (pode demorar na primeira vez)...", settings.whisper_model)
        _whisper_model = WhisperModel(
            settings.whisper_model,
            device="cpu",
            compute_type="int8",   # quantização — menor RAM, mesma qualidade
        )
        logger.info("Modelo Whisper carregado.")
    return _whisper_model


# ---------------------------------------------------------------------------
# Pipeline principal
# ---------------------------------------------------------------------------


async def run_transcription_pipeline(
    db: AsyncSession,
    appointment_id: UUID,
) -> None:
    """Baixa gravação e transcreve com Whisper. Idempotente."""
    recording = (
        await db.execute(
            select(SessionRecording).where(SessionRecording.appointment_id == appointment_id)
        )
    ).scalar_one_or_none()

    if recording is None:
        logger.error("Nenhuma gravação encontrada para appointment %s", appointment_id)
        return

    if recording.status == RecordingStatus.done:
        logger.info("Gravação %s já processada — pulando.", appointment_id)
        return

    appt = (
        await db.execute(select(Appointment).where(Appointment.id == appointment_id))
    ).scalar_one_or_none()

    if not appt or not recording.recording_url:
        logger.error("Appointment ou URL de gravação ausente para %s", appointment_id)
        return

    try:
        # ── 1. Download ────────────────────────────────────────────────────────
        _set_recording_status(recording, RecordingStatus.downloading)
        db.add(recording)
        await db.commit()

        audio_bytes = await _download_recording(recording.recording_url)

        # ── 2. Transcrição ────────────────────────────────────────────────────
        _set_recording_status(recording, RecordingStatus.transcribing)
        db.add(recording)
        await db.commit()

        segments = await _transcribe_audio(audio_bytes)
        full_text = _build_full_text(segments)
        word_count = len(full_text.split())

        # ── 3. Persistência ───────────────────────────────────────────────────
        existing = (
            await db.execute(
                select(SessionTranscript).where(
                    SessionTranscript.appointment_id == appointment_id
                )
            )
        ).scalar_one_or_none()

        transcript = existing or SessionTranscript(appointment_id=appointment_id)
        transcript.full_text = full_text
        transcript.segments = json.dumps(segments, ensure_ascii=False)
        transcript.language = "pt-BR"
        transcript.word_count = word_count
        transcript.status = TranscriptStatus.done
        transcript.transcribed_at = datetime.utcnow()
        transcript.updated_at = datetime.utcnow()
        db.add(transcript)

        _set_recording_status(recording, RecordingStatus.done)
        db.add(recording)
        await db.commit()

        logger.info(
            "Transcrição concluída para appointment %s — %d palavras",
            appointment_id,
            word_count,
        )

    except Exception as exc:
        logger.exception("Falha na transcrição do appointment %s: %s", appointment_id, exc)
        recording.status = RecordingStatus.error
        recording.error_message = str(exc)[:500]
        recording.updated_at = datetime.utcnow()
        db.add(recording)

        existing_t = (
            await db.execute(
                select(SessionTranscript).where(
                    SessionTranscript.appointment_id == appointment_id
                )
            )
        ).scalar_one_or_none()
        if existing_t:
            existing_t.status = TranscriptStatus.failed
            existing_t.updated_at = datetime.utcnow()
            db.add(existing_t)

        await db.commit()


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------


def _set_recording_status(rec: SessionRecording, st: RecordingStatus) -> None:
    rec.status = st
    rec.updated_at = datetime.utcnow()


async def _download_recording(url: str) -> bytes:
    """Baixa o arquivo de áudio/vídeo da URL (Daily.co presigned URL)."""
    async with httpx.AsyncClient(timeout=300) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content


async def _transcribe_audio(audio_bytes: bytes) -> list[dict[str, Any]]:
    """
    Transcreve áudio localmente com faster-whisper (sem enviar dados para fora).
    Heurística de diarização: troca de falante quando pausa > 0.8 s.
    """
    # Salva bytes em arquivo temporário (faster-whisper precisa de path)
    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    try:
        tmp.write(audio_bytes)
        tmp.close()
        # Roda em thread separada — operação CPU-bound não bloqueia o event loop
        return await asyncio.to_thread(_run_whisper_sync, tmp.name)
    finally:
        os.unlink(tmp.name)  # apaga áudio do disco imediatamente após transcrever


def _run_whisper_sync(audio_path: str) -> list[dict[str, Any]]:
    """Executa faster-whisper de forma síncrona (chamado via asyncio.to_thread)."""
    model = _get_whisper_model()
    raw_segments, _ = model.transcribe(
        audio_path,
        language="pt",
        word_timestamps=False,
        vad_filter=True,          # filtra silêncios — melhora diarização
        vad_parameters={"min_silence_duration_ms": 800},
    )

    segments: list[dict[str, Any]] = []
    last_speaker = "Psicóloga"
    prev_end = 0.0

    for seg in raw_segments:
        start = float(seg.start)
        end = float(seg.end)
        text = seg.text.strip()
        gap = start - prev_end

        # Troca de falante a cada pausa > 0.8 s (heurística simples)
        if gap > 0.8 and segments:
            last_speaker = "Paciente" if last_speaker == "Psicóloga" else "Psicóloga"

        segments.append(
            {
                "speaker": last_speaker,
                "text": text,
                "start_ms": int(start * 1000),
                "end_ms": int(end * 1000),
            }
        )
        prev_end = end

    return segments


def transcribe_bytes_sync(audio_bytes: bytes, suffix: str = ".webm") -> list[dict[str, Any]]:
    """Sync helper: escreve bytes em arquivo temp e transcreve. Usar via asyncio.to_thread."""
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(audio_bytes)
        tmp.close()
        return _run_whisper_sync(tmp.name)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def _build_full_text(segments: list[dict[str, Any]]) -> str:
    return "\n".join(f"[{s['speaker']}] {s['text']}" for s in segments)


# ---------------------------------------------------------------------------
# Pipeline para upload manual (sem Daily.co)
# ---------------------------------------------------------------------------


async def run_transcription_pipeline_from_file(
    db: AsyncSession,
    appointment_id: UUID,
    file_path: str,
) -> None:
    """Transcreve diretamente de arquivo local — bypassa o download do Daily.co."""
    existing_rec = (
        await db.execute(
            select(SessionRecording).where(SessionRecording.appointment_id == appointment_id)
        )
    ).scalar_one_or_none()

    recording = existing_rec or SessionRecording(
        appointment_id=appointment_id,
        daily_recording_id="manual-upload",
        recording_url=file_path,
    )

    try:
        _set_recording_status(recording, RecordingStatus.transcribing)
        db.add(recording)
        await db.commit()

        # Roda Whisper diretamente no arquivo (sem converter para bytes)
        segments = await asyncio.to_thread(_run_whisper_sync, file_path)
        full_text = _build_full_text(segments)
        word_count = len(full_text.split())

        existing_t = (
            await db.execute(
                select(SessionTranscript).where(
                    SessionTranscript.appointment_id == appointment_id
                )
            )
        ).scalar_one_or_none()

        transcript = existing_t or SessionTranscript(appointment_id=appointment_id)
        transcript.full_text = full_text
        transcript.segments = json.dumps(segments, ensure_ascii=False)
        transcript.language = "pt-BR"
        transcript.word_count = word_count
        transcript.status = TranscriptStatus.done
        transcript.transcribed_at = datetime.utcnow()
        transcript.updated_at = datetime.utcnow()
        db.add(transcript)

        _set_recording_status(recording, RecordingStatus.done)
        db.add(recording)
        await db.commit()

        logger.info(
            "Transcrição manual concluída: %s — %d palavras", appointment_id, word_count
        )

    except Exception as exc:
        logger.exception("Falha na transcrição manual de %s: %s", appointment_id, exc)
        recording.status = RecordingStatus.error
        recording.error_message = str(exc)[:500]
        recording.updated_at = datetime.utcnow()
        db.add(recording)

        existing_t = (
            await db.execute(
                select(SessionTranscript).where(
                    SessionTranscript.appointment_id == appointment_id
                )
            )
        ).scalar_one_or_none()
        if existing_t:
            existing_t.status = TranscriptStatus.failed
            existing_t.updated_at = datetime.utcnow()
            db.add(existing_t)

        await db.commit()
