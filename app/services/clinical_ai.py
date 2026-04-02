"""
app/services/clinical_ai.py
-----------------------------
Gera resumo clínico estruturado a partir da transcrição.
Usa Ollama (local, LGPD) como provider principal.
Fallback para Claude (Anthropic) se ANTHROPIC_API_KEY estiver configurado
e o Ollama não estiver disponível.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.config import settings
from app.models.domain import RiskLevel, SessionSummary, SessionTranscript

logger = logging.getLogger(__name__)

# Modelo usado — preenchido no momento da geração
_CLAUDE_MODEL = "claude-opus-4-6"

SYSTEM_PROMPT = """\
Você é um assistente de apoio clínico especializado em psicologia brasileira. \
Sua tarefa é analisar a transcrição de uma sessão terapêutica e preencher os campos \
de um prontuário psicológico digital.

REGRAS OBRIGATÓRIAS:
1. Baseie-se EXCLUSIVAMENTE no conteúdo da transcrição — nunca invente informações.
2. Use linguagem técnica e objetiva, como em um prontuário real.
3. Hipóteses diagnósticas são SUGESTÕES baseadas nos relatos — não diagnósticos confirmados.
4. Não identifique o paciente pelo nome no resumo; use "o/a paciente".
5. Se uma informação não constar na transcrição, deixe o campo com string vazia "".
6. O campo risk_level deve ser exatamente "low", "medium" ou "high".
7. Responda SOMENTE com JSON válido, sem markdown nem texto extra.

Formato da resposta (JSON):
{
  "chief_complaint": "Motivo principal que levou o paciente à sessão.",
  "mental_status": "Exame do estado mental: humor, afeto, pensamento, percepção, cognição, comportamento.",
  "diagnostic_hypotheses": "Hipóteses diagnósticas sugeridas com referência ao CID-10/DSM-5.",
  "interventions": "Técnicas e intervenções utilizadas pela psicóloga na sessão.",
  "session_content": "Resumo narrativo do conteúdo abordado na sessão em 3 a 5 parágrafos.",
  "patient_evolution": "Evolução do paciente em relação à sessão anterior (se mencionada).",
  "therapeutic_plan": "Objetivos terapêuticos de curto e longo prazo identificados.",
  "next_steps": "Tarefas, encaminhamentos ou tópicos para a próxima sessão.",
  "risk_level": "low",
  "additional_notes": "Qualquer observação relevante não coberta pelos campos acima."
}
"""


# ---------------------------------------------------------------------------
# Função principal
# ---------------------------------------------------------------------------


async def generate_clinical_summary(
    db: AsyncSession,
    appointment_id: UUID,
    force: bool = False,
) -> None:
    """Gera e persiste o resumo clínico. Usa Ollama; fallback para Claude."""
    transcript = (
        await db.execute(
            select(SessionTranscript).where(
                SessionTranscript.appointment_id == appointment_id
            )
        )
    ).scalar_one_or_none()

    if transcript is None or not transcript.full_text:
        logger.error("Transcrição ausente para appointment %s", appointment_id)
        return

    existing = (
        await db.execute(
            select(SessionSummary).where(SessionSummary.appointment_id == appointment_id)
        )
    ).scalar_one_or_none()

    if existing and not force:
        logger.info("Resumo já existe para %s — use force=True para regerar.", appointment_id)
        return

    try:
        result, model_used = await _call_ai(transcript.full_text)
    except Exception as exc:
        logger.exception("Falha na geração do resumo para %s: %s", appointment_id, exc)
        return

    summary = existing or SessionSummary(appointment_id=appointment_id)
    summary.chief_complaint       = result.get("chief_complaint", "")
    summary.mental_status         = result.get("mental_status", "")
    summary.diagnostic_hypotheses = result.get("diagnostic_hypotheses", "")
    summary.interventions         = result.get("interventions", "")
    summary.session_content       = result.get("session_content", "")
    summary.patient_evolution     = result.get("patient_evolution", "")
    summary.therapeutic_plan      = result.get("therapeutic_plan", "")
    summary.next_steps            = result.get("next_steps", "")
    summary.additional_notes      = result.get("additional_notes", "")
    summary.risk_level            = _safe_risk(result.get("risk_level", "low"))
    summary.ai_model_used         = model_used
    summary.ai_generated_at       = datetime.utcnow()
    summary.updated_at            = datetime.utcnow()

    db.add(summary)
    await db.commit()
    logger.info("Resumo clínico gerado para %s via %s", appointment_id, model_used)


# ---------------------------------------------------------------------------
# Roteador de AI: tenta Ollama → fallback Claude
# ---------------------------------------------------------------------------


async def _call_ai(transcript_text: str) -> tuple[dict, str]:
    """Tenta Ollama primeiro; se falhar e Anthropic estiver configurado, usa Claude."""
    try:
        result = await _call_ollama(transcript_text, SYSTEM_PROMPT)
        return result, settings.ollama_model
    except Exception as ollama_err:
        logger.warning("Ollama indisponível (%s) — tentando Claude.", ollama_err)

    if settings.anthropic_api_key:
        result = await _call_claude(transcript_text)
        return result, _CLAUDE_MODEL

    raise RuntimeError(
        "Nenhum provider de IA disponível. "
        "Certifique-se que o Ollama está rodando ou configure ANTHROPIC_API_KEY."
    )


# ---------------------------------------------------------------------------
# Ollama (local)
# ---------------------------------------------------------------------------


async def _call_ollama(text: str, system: str, max_tokens: int = 4096) -> dict:
    """Chama Ollama via REST API local."""
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.post(
            f"{settings.ollama_host}/api/chat",
            json={
                "model": settings.ollama_model,
                "messages": [
                    {"role": "system", "content": system},
                    {
                        "role": "user",
                        "content": (
                            "Analise esta transcrição de sessão terapêutica e preencha o prontuário:\n\n"
                            + text
                        ),
                    },
                ],
                "stream": False,
                "format": "json",
                "options": {"num_predict": max_tokens, "temperature": 0.2},
            },
        )
        response.raise_for_status()

    raw = response.json()["message"]["content"].strip()
    return json.loads(raw)


# ---------------------------------------------------------------------------
# Claude (fallback opcional)
# ---------------------------------------------------------------------------


async def _call_claude(transcript_text: str) -> dict:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model=_CLAUDE_MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": (
                    "Analise esta transcrição de sessão terapêutica e preencha o prontuário:\n\n"
                    + transcript_text
                ),
            }
        ],
    )
    raw = message.content[0].text.strip()  # type: ignore[index]
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()
    return json.loads(raw)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _safe_risk(value: str) -> RiskLevel:
    try:
        return RiskLevel(value)
    except ValueError:
        return RiskLevel.low


# ---------------------------------------------------------------------------
# Função pública para análise ao vivo (usada pelo ws_scribe)
# ---------------------------------------------------------------------------

_LIVE_SYSTEM = """\
Você é um assistente clínico de apoio à psicóloga durante uma sessão em andamento.
Analise esta transcrição PARCIAL e responda SOMENTE com JSON válido, sem markdown.

{
  "emotional_state": "estado emocional do paciente em 1 frase objetiva",
  "main_themes": ["tema1", "tema2", "tema3"],
  "risk_level": "low",
  "risk_reason": "motivo se medium ou high, vazio se low",
  "suggestions": ["ação ou pergunta sugerida para a psicóloga (máx 2)"],
  "observations": "observação clínica relevante em 1-2 frases"
}

Use terminologia clínica psicológica brasileira.
Se não há informação suficiente, mantenha risk_level como "low".
Responda SOMENTE o JSON, sem texto fora dele.
"""


async def live_analysis(transcript_text: str) -> dict | None:
    """Análise clínica parcial para o scribe ao vivo. Retorna None em caso de falha."""
    try:
        try:
            return await _call_ollama(transcript_text[-3000:], _LIVE_SYSTEM, max_tokens=512)
        except Exception as ollama_err:
            logger.warning("Ollama live analysis falhou (%s) — tentando Claude.", ollama_err)

        if settings.anthropic_api_key:
            from anthropic import AsyncAnthropic

            client = AsyncAnthropic(api_key=settings.anthropic_api_key)
            msg = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                system=_LIVE_SYSTEM,
                messages=[{"role": "user", "content": transcript_text[-3000:]}],
            )
            raw = msg.content[0].text.strip()  # type: ignore[index]
            if "```" in raw:
                raw = raw.split("```")[1].lstrip("json").strip().split("```")[0]
            return json.loads(raw)

    except Exception as e:
        logger.warning("Falha na análise ao vivo: %s", e)

    return None
