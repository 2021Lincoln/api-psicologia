"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"

import { useAuth } from "@/providers/auth-context"
import { useToast } from "@/components/ui/toast"
import { authHeaders } from "@/lib/auth"

// Carregado dinamicamente — APIs de browser (Daily.co / WebSocket / MediaRecorder) só no client
const VideoRoom = dynamic(() => import("@/components/VideoRoom"), { ssr: false })
const LiveScribePanel = dynamic(() => import("@/components/LiveScribePanel"), { ssr: false })

// ── Tipos ──────────────────────────────────────────────────────────────────────

type Segment = {
  speaker: string
  text: string
  start_ms: number
  end_ms: number
}

type Transcript = {
  appointment_id: string
  status: string
  full_text?: string | null
  segments: Segment[]
  word_count: number
  transcribed_at?: string | null
}

type Summary = {
  appointment_id: string
  chief_complaint?: string | null
  mental_status?: string | null
  diagnostic_hypotheses?: string | null
  interventions?: string | null
  session_content?: string | null
  patient_evolution?: string | null
  therapeutic_plan?: string | null
  next_steps?: string | null
  risk_level: string
  additional_notes?: string | null
  ai_model_used?: string | null
  ai_generated_at?: string | null
  last_edited_at?: string | null
}

const API = "/api/v1"

function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, "0")}`
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

const RISK_LABELS: Record<string, string> = { low: "Baixo", medium: "Médio", high: "Alto" }
const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  high: "bg-red-500/15 text-red-400 border-red-500/30",
}

const SUMMARY_FIELDS: { key: keyof Summary; label: string; icon: string }[] = [
  { key: "chief_complaint",       label: "Motivo da consulta",          icon: "💬" },
  { key: "mental_status",         label: "Exame do estado mental",       icon: "🧠" },
  { key: "diagnostic_hypotheses", label: "Hipóteses diagnósticas",       icon: "🔬" },
  { key: "interventions",         label: "Intervenções realizadas",      icon: "🛠" },
  { key: "session_content",       label: "Conteúdo da sessão",           icon: "📝" },
  { key: "patient_evolution",     label: "Evolução do paciente",         icon: "📈" },
  { key: "therapeutic_plan",      label: "Plano terapêutico",            icon: "🎯" },
  { key: "next_steps",            label: "Próximos passos",              icon: "➡️" },
  { key: "additional_notes",      label: "Observações adicionais",       icon: "💡" },
]

// ── Componente principal ───────────────────────────────────────────────────────

export default function SessionPage() {
  const { user, loading } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [fetching, setFetching] = useState(true)
  const [activeTab, setActiveTab] = useState<"video" | "scribe" | "summary" | "transcript">("summary")
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [editData, setEditData] = useState<Partial<Summary>>({})
  const [roomUrl, setRoomUrl] = useState<string | null>(null)
  const [meetingToken, setMeetingToken] = useState<string | undefined>(undefined)
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (loading) return
    if (!user) { router.push("/login"); return }
    if (user.role !== "psychologist") { router.push("/dashboard/paciente"); return }
    if (!id) return
    ;(async () => {
      try {
        const h = authHeaders()
        const [tRes, sRes, vRes] = await Promise.allSettled([
          fetch(`${API}/appointments/${id}/transcript`, { headers: h }),
          fetch(`${API}/appointments/${id}/summary`, { headers: h }),
          fetch(`${API}/video/appointments/${id}/room-access`, { headers: h }),
        ])

        if (tRes.status === "fulfilled" && tRes.value.ok) {
          setTranscript(await tRes.value.json())
        }
        if (sRes.status === "fulfilled" && sRes.value.ok) {
          const s = await sRes.value.json()
          setSummary(s)
          setEditData(s)
        }
        if (vRes.status === "fulfilled" && vRes.value.ok) {
          const v = await vRes.value.json()
          setRoomUrl(v.room_url)
          setMeetingToken(v.meeting_token)
          setActiveTab("video")
        }
      } catch (e: any) {
        toast(e.message, "error")
      } finally {
        setFetching(false)
      }
    })()
  }, [user, loading, router, id])

  async function handleSave() {
    if (!summary && !editData) return
    setSaving(true)
    try {
      const res = await fetch(`${API}/appointments/${id}/summary`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(editData),
      })
      if (!res.ok) throw new Error("Erro ao salvar prontuário.")
      const updated = await res.json()
      setSummary(updated)
      setEditData(updated)
      setEditing(false)
      toast("Prontuário salvo com sucesso!", "success")
    } catch (e: any) {
      toast(e.message, "error")
    } finally {
      setSaving(false)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`${API}/appointments/${id}/transcript/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? "Erro ao enviar áudio.")
      }
      setUploadDone(true)
      toast("Áudio enviado! Transcrevendo… isso pode levar alguns minutos.", "info")

      // Poll every 6 s until transcript is ready
      pollRef.current = setInterval(async () => {
        try {
          const tRes = await fetch(`${API}/appointments/${id}/transcript`, {
            headers: authHeaders(),
          })
          if (tRes.ok) {
            const t = await tRes.json()
            if (t.status === "done") {
              setTranscript(t)
              clearInterval(pollRef.current!)
              pollRef.current = null
              toast("Transcrição concluída!", "success")
              // fetch summary too
              const sRes = await fetch(`${API}/appointments/${id}/summary`, { headers: authHeaders() })
              if (sRes.ok) { const s = await sRes.json(); setSummary(s); setEditData(s) }
            }
          }
        } catch { /* ignore poll errors */ }
      }, 6000)
    } catch (err: any) {
      toast(err.message, "error")
    } finally {
      setUploading(false)
    }
  }

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  async function handleRegenerate() {
    setRegenerating(true)
    try {
      const res = await fetch(`${API}/appointments/${id}/summary/regenerate`, {
        method: "POST",
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error("Erro ao solicitar regeração.")
      toast("Prontuário sendo regerado. Atualize a página em alguns instantes.", "info")
    } catch (e: any) {
      toast(e.message, "error")
    } finally {
      setRegenerating(false)
    }
  }

  if (loading || fetching) {
    return (
      <div className="grid gap-4 animate-pulse">
        {[1, 2, 3].map((n) => <div key={n} className="card h-24" />)}
      </div>
    )
  }

  if (!transcript && !summary) {
    return (
      <main className="flex flex-col gap-4">
        <Link href="/dashboard/psicologa" className="text-xs text-slate-500 hover:text-cyan-300">
          ← Voltar ao dashboard
        </Link>
        <div className="card p-10 text-center">
          <p className="text-4xl">⏳</p>
          <p className="mt-4 text-slate-300 font-medium">Processando sessão…</p>
          <p className="mt-1 text-sm text-slate-500">
            A transcrição e o prontuário serão gerados automaticamente após o encerramento da sessão.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex flex-col gap-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-50">Sessão</h1>
          {summary?.ai_generated_at && (
            <p className="text-xs text-slate-500">
              Prontuário gerado em {fmtDateTime(summary.ai_generated_at)}
              {summary.last_edited_at && ` · Editado em ${fmtDateTime(summary.last_edited_at)}`}
            </p>
          )}
        </div>
        <Link href="/dashboard/psicologa" className="text-xs text-slate-500 hover:text-cyan-300 transition">
          ← Voltar ao dashboard
        </Link>
      </div>

      {/* ── Risco ── */}
      {summary && (
        <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${RISK_COLORS[summary.risk_level] ?? ""}`}>
          <span className="text-lg">{summary.risk_level === "high" ? "⚠️" : summary.risk_level === "medium" ? "△" : "✓"}</span>
          <div>
            <p className="text-sm font-semibold">Nível de Risco: {RISK_LABELS[summary.risk_level] ?? summary.risk_level}</p>
            {summary.risk_level === "high" && (
              <p className="text-xs opacity-80">Requer atenção imediata. Considere protocolo de segurança.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Abas ── */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-slate-900/40 p-1">
        {(
          [
            ...(roomUrl ? [["video", "🎥 Sessão ao vivo"]] : []),
            ["scribe",     "🎙️ Scribe ao Vivo"],
            ["summary",    "📋 Prontuário"],
            ["transcript", "📝 Transcrição"],
          ] as [string, string][]
        ).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            className={[
              "flex-1 rounded-lg py-2 text-sm font-medium transition",
              activeTab === tab
                ? "bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-slate-100 border border-white/10"
                : "text-slate-500 hover:text-slate-300",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Aba: Vídeo ── */}
      {activeTab === "video" && roomUrl && (
        <VideoRoom
          appointmentId={id}
          roomUrl={roomUrl}
          meetingToken={meetingToken}
          onLeft={() => setActiveTab("summary")}
        />
      )}

      {/* ── Aba: Scribe ao vivo ── */}
      {activeTab === "scribe" && (
        <LiveScribePanel appointmentId={id} />
      )}

      {/* ── Aba: Prontuário ── */}
      {activeTab === "summary" && (
        <div className="flex flex-col gap-4">
          {/* Ações */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {summary?.ai_model_used ? `Gerado por ${summary.ai_model_used}` : "Prontuário clínico"}
            </p>
            <div className="flex gap-2">
              {transcript && (
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-violet-500/40 hover:text-violet-300 disabled:opacity-50"
                >
                  {regenerating ? "Regerando…" : "⟳ Regerar com IA"}
                </button>
              )}
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-cyan-500/40 hover:text-cyan-300"
                >
                  ✏️ Editar
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditing(false); setEditData(summary ?? {}) }}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60"
                  >
                    {saving ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Nível de risco (editável) */}
          {editing && (
            <div className="card p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                ⚠ Nível de Risco
              </p>
              <div className="flex gap-2">
                {(["low", "medium", "high"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setEditData((d) => ({ ...d, risk_level: r }))}
                    className={[
                      "rounded-lg border px-4 py-1.5 text-xs font-semibold transition",
                      editData.risk_level === r
                        ? RISK_COLORS[r]
                        : "border-white/10 text-slate-500 hover:border-white/20",
                    ].join(" ")}
                  >
                    {RISK_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Campos clínicos */}
          {summary || editing ? (
            SUMMARY_FIELDS.map(({ key, label, icon }) => {
              const value = editing ? (editData[key] as string | null) : (summary?.[key] as string | null)
              if (!editing && !value) return null
              return (
                <div key={key} className="card p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                    {icon} {label}
                  </p>
                  {editing ? (
                    <textarea
                      rows={4}
                      value={(editData[key] as string) ?? ""}
                      onChange={(e) => setEditData((d) => ({ ...d, [key]: e.target.value }))}
                      className="w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-400 placeholder:text-slate-600"
                      placeholder={`Digite ${label.toLowerCase()}…`}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                      {value}
                    </p>
                  )}
                </div>
              )
            })
          ) : (
            <div className="card p-8 text-center">
              <p className="text-3xl">🤖</p>
              <p className="mt-3 text-slate-400">Prontuário ainda não gerado.</p>
              <p className="mt-1 text-sm text-slate-500">
                Será criado automaticamente após a transcrição da sessão.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Aba: Transcrição ── */}
      {activeTab === "transcript" && (
        <div className="flex flex-col gap-3">
          {transcript ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {transcript.word_count} palavras
                  {transcript.transcribed_at && ` · Transcrita em ${fmtDateTime(transcript.transcribed_at)}`}
                </p>
                {transcript.status !== "done" && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                    {transcript.status === "processing" ? "⏳ Processando…" : "❌ Falhou"}
                  </span>
                )}
              </div>

              {transcript.segments.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {transcript.segments.map((seg, i) => {
                    const isPsych = seg.speaker === "Psicóloga"
                    return (
                      <div
                        key={i}
                        className={[
                          "flex gap-3",
                          isPsych ? "flex-row" : "flex-row-reverse",
                        ].join(" ")}
                      >
                        {/* Avatar bolinha */}
                        <div className={[
                          "mt-0.5 shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold",
                          isPsych
                            ? "bg-gradient-to-br from-cyan-500/30 to-violet-500/30 text-cyan-300"
                            : "bg-gradient-to-br from-emerald-500/30 to-teal-500/30 text-emerald-300",
                        ].join(" ")}>
                          {isPsych ? "P" : "Pc"}
                        </div>

                        {/* Balão */}
                        <div className={[
                          "max-w-[78%] rounded-2xl px-3 py-2",
                          isPsych
                            ? "bg-slate-800/60 rounded-tl-none"
                            : "bg-cyan-500/10 border border-cyan-500/20 rounded-tr-none",
                        ].join(" ")}>
                          <p className={`text-[10px] mb-0.5 font-semibold ${isPsych ? "text-cyan-400" : "text-emerald-400"}`}>
                            {seg.speaker} · {fmtTime(seg.start_ms)}
                          </p>
                          <p className="text-sm leading-relaxed text-slate-200">{seg.text}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : transcript.full_text ? (
                <div className="card p-5">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200 font-sans">
                    {transcript.full_text}
                  </pre>
                </div>
              ) : (
                <div className="card p-8 text-center">
                  <p className="text-3xl">⏳</p>
                  <p className="mt-3 text-slate-400">Transcrição em processamento…</p>
                </div>
              )}
            </>
          ) : (
            <div className="card p-8 flex flex-col items-center gap-4 text-center">
              {uploadDone ? (
                <>
                  <p className="text-3xl animate-pulse">⏳</p>
                  <p className="text-slate-300 font-medium">Transcrevendo áudio…</p>
                  <p className="text-sm text-slate-500">
                    O Whisper está processando localmente. Aguarde — pode levar alguns minutos.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl">🎙️</p>
                  <p className="text-slate-300 font-medium">Nenhuma transcrição disponível.</p>
                  <p className="text-sm text-slate-500 max-w-sm">
                    Faça upload do áudio/vídeo da sessão para gerar a transcrição automaticamente com IA.
                  </p>
                  <label className={[
                    "mt-2 cursor-pointer rounded-xl border border-dashed border-cyan-500/40 px-6 py-4",
                    "text-sm text-cyan-400 hover:border-cyan-400 hover:bg-cyan-500/5 transition",
                    uploading ? "opacity-50 pointer-events-none" : "",
                  ].join(" ")}>
                    {uploading ? "⏫ Enviando…" : "⬆ Selecionar arquivo de áudio / vídeo"}
                    <input
                      type="file"
                      accept="audio/*,video/mp4,video/webm"
                      className="hidden"
                      onChange={handleUpload}
                      disabled={uploading}
                    />
                  </label>
                  <p className="text-[11px] text-slate-600">MP3 · WAV · OGG · WEBM · MP4 · M4A · FLAC — máx 500 MB</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  )
}
