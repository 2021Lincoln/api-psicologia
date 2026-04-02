"use client"

/**
 * LiveScribePanel — Scribe clínico ao vivo (estilo Suki/DAX)
 *
 * Captura o microfone durante a sessão, envia chunks de áudio via WebSocket,
 * recebe transcrição ao vivo e análise clínica da IA.
 */

import { useEffect, useRef, useState } from "react"
import { getToken } from "@/lib/auth"

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Analysis = {
  emotional_state: string
  main_themes: string[]
  risk_level: "low" | "medium" | "high"
  risk_reason: string
  suggestions: string[]
  observations: string
}

type Props = {
  appointmentId: string
}

const WS_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    .replace(/^https/, "wss")
    .replace(/^http/, "ws")

const RISK_COLOR: Record<string, string> = {
  low:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15  text-amber-400  border-amber-500/30",
  high:   "bg-red-500/15    text-red-400    border-red-500/30",
}
const RISK_LABEL: Record<string, string> = {
  low: "Baixo", medium: "Médio", high: "Alto",
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function LiveScribePanel({ appointmentId }: Props) {
  const [status, setStatus] = useState<"idle" | "connecting" | "active" | "stopped" | "error">("idle")
  const [transcript, setTranscript] = useState<string[]>([])
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [micOk, setMicOk] = useState<boolean | null>(null)

  const wsRef      = useRef<WebSocket | null>(null)
  const recRef     = useRef<MediaRecorder | null>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const scrollRef  = useRef<HTMLDivElement | null>(null)

  // Auto-scroll transcript
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [transcript])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopScribe(false)
  }, [])

  async function startScribe() {
    setErrorMsg(null)
    setStatus("connecting")

    // ── 1. Microfone ──────────────────────────────────────────────────────────
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream
      setMicOk(true)
    } catch (e: any) {
      setMicOk(false)
      setErrorMsg("Microfone bloqueado. Permita o acesso ao microfone e tente novamente.")
      setStatus("error")
      return
    }

    // ── 2. WebSocket ──────────────────────────────────────────────────────────
    const token = getToken()
    if (!token) {
      setErrorMsg("Sessão expirada. Faça login novamente.")
      setStatus("error")
      return
    }

    const wsUrl = `${WS_BASE}/api/v1/ws/appointments/${appointmentId}/scribe?token=${token}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onclose = (ev) => {
      if (status !== "stopped") setStatus(ev.code === 4001 || ev.code === 4003 ? "error" : "stopped")
      if (ev.code === 4001) setErrorMsg("Token inválido ou sessão expirada.")
      if (ev.code === 4003) setErrorMsg("Acesso negado a este agendamento.")
    }
    ws.onerror = () => {
      setStatus("error")
      setErrorMsg("Erro na conexão com o servidor.")
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === "transcript" && msg.delta) {
          setTranscript((prev) => [...prev, msg.delta])
        } else if (msg.type === "analysis" && msg.data) {
          setAnalysis(msg.data)
        }
      } catch { /* ignore */ }
    }

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve()
      setTimeout(() => reject(new Error("Timeout conectando ao servidor.")), 8000)
    }).catch((e) => {
      setErrorMsg(e.message)
      setStatus("error")
      stream.getTracks().forEach((t) => t.stop())
      return
    })

    if (ws.readyState !== WebSocket.OPEN) return

    // ── 3. MediaRecorder (webm/opus) ──────────────────────────────────────────
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm"

    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 })
    recRef.current = recorder

    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        ev.data.arrayBuffer().then((buf) => ws.send(buf))
      }
    }

    // Envia chunk a cada 8 segundos
    recorder.start(8_000)
    setStatus("active")
  }

  function stopScribe(notify = true) {
    recRef.current?.stop()
    recRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    if (notify && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stop" }))
    }
    wsRef.current?.close()
    wsRef.current = null

    if (notify) setStatus("stopped")
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (status === "idle") {
    return (
      <div className="card p-10 flex flex-col items-center gap-5 text-center">
        <div className="relative">
          <span className="text-5xl">🎙️</span>
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-100">Scribe Clínico ao Vivo</p>
          <p className="mt-1 text-sm text-slate-500 max-w-sm">
            Capture o áudio da sessão e receba transcrição + análise clínica em tempo real.
            <br />
            <span className="text-slate-600 text-xs">
              Use o alto-falante (não fone) para capturar também a voz do paciente.
            </span>
          </p>
        </div>
        {micOk === false && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            Microfone bloqueado. Permita o acesso no navegador.
          </p>
        )}
        <button
          onClick={startScribe}
          className="rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-8 py-3 font-semibold text-slate-950 hover:brightness-110 transition"
        >
          Iniciar Scribe
        </button>
      </div>
    )
  }

  if (status === "connecting") {
    return (
      <div className="card p-10 flex flex-col items-center gap-3 text-center">
        <span className="text-3xl animate-pulse">🔌</span>
        <p className="text-slate-300">Conectando ao scribe…</p>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="card p-8 flex flex-col items-center gap-4 text-center">
        <span className="text-3xl">⚠️</span>
        <p className="text-red-400 font-medium">{errorMsg ?? "Erro desconhecido."}</p>
        <button
          onClick={() => { setStatus("idle"); setErrorMsg(null) }}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          {status === "active" ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-sm font-medium text-slate-200">Gravando ao vivo</span>
            </>
          ) : (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
              <span className="text-sm text-slate-400">Scribe encerrado</span>
            </>
          )}
          <span className="text-xs text-slate-600">· {transcript.length} segmentos</span>
        </div>
        {status === "active" && (
          <button
            onClick={() => stopScribe(true)}
            className="rounded-lg border border-red-500/30 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition"
          >
            Encerrar
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* ── Transcrição ao vivo ── */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            📝 Transcrição ao vivo
          </p>
          <div
            ref={scrollRef}
            className="card h-72 overflow-y-auto p-4 flex flex-col gap-2"
          >
            {transcript.length === 0 ? (
              <p className="text-sm text-slate-600 italic">
                {status === "active"
                  ? "Aguardando fala… (pode levar ~8s para o primeiro texto)"
                  : "Nenhum texto capturado."}
              </p>
            ) : (
              transcript.map((line, i) => (
                <p key={i} className="text-sm leading-relaxed text-slate-200">
                  {line}
                </p>
              ))
            )}
            {status === "active" && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-600 mt-1">
                <span className="animate-pulse">●</span> processando…
              </span>
            )}
          </div>
        </div>

        {/* ── Análise clínica ao vivo ── */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            🧠 Análise clínica (IA)
          </p>
          {!analysis ? (
            <div className="card h-72 flex items-center justify-center">
              <p className="text-sm text-slate-600 italic text-center px-4">
                {status === "active"
                  ? "A análise aparecerá após ~120 palavras transcritas."
                  : "Nenhuma análise disponível."}
              </p>
            </div>
          ) : (
            <div className="card h-72 overflow-y-auto p-4 flex flex-col gap-3">

              {/* Risco */}
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${RISK_COLOR[analysis.risk_level] ?? ""}`}>
                <span>{analysis.risk_level === "high" ? "⚠️" : analysis.risk_level === "medium" ? "△" : "✓"}</span>
                <div>
                  <p className="text-xs font-semibold">Risco: {RISK_LABEL[analysis.risk_level]}</p>
                  {analysis.risk_reason && (
                    <p className="text-[11px] opacity-80">{analysis.risk_reason}</p>
                  )}
                </div>
              </div>

              {/* Estado emocional */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
                  Estado emocional
                </p>
                <p className="text-sm text-slate-200">{analysis.emotional_state}</p>
              </div>

              {/* Temas principais */}
              {analysis.main_themes?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Temas
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {analysis.main_themes.map((t, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-violet-500/15 border border-violet-500/20 px-2 py-0.5 text-xs text-violet-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sugestões */}
              {analysis.suggestions?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Sugestões para a psicóloga
                  </p>
                  <ul className="flex flex-col gap-1">
                    {analysis.suggestions.map((s, i) => (
                      <li key={i} className="flex gap-1.5 text-xs text-cyan-300">
                        <span className="text-cyan-500 mt-0.5">→</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Observações */}
              {analysis.observations && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
                    Observações
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">{analysis.observations}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Aviso de privacidade */}
      <p className="text-center text-[11px] text-slate-700">
        🔒 Áudio processado localmente via Whisper — nenhum dado enviado a terceiros (LGPD)
      </p>
    </div>
  )
}
