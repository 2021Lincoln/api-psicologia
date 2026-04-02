"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"

import { useAuth } from "@/providers/auth-context"
import { useToast } from "@/components/ui/toast"
import { authHeaders } from "@/lib/auth"

type SessionItem = {
  appointment_id: string
  scheduled_at: string
  duration_minutes: number
  status: string
  has_transcript: boolean
  has_summary: boolean
  risk_level?: string | null
}

const API = "/api/v1"

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function RiskBadge({ level }: { level?: string | null }) {
  if (!level) return null
  const map: Record<string, string> = {
    low: "bg-emerald-500/15 text-emerald-400",
    medium: "bg-amber-500/15 text-amber-400",
    high: "bg-red-500/15 text-red-400",
  }
  const label: Record<string, string> = { low: "Risco baixo", medium: "Risco médio", high: "Risco alto" }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${map[level] ?? ""}`}>
      {level === "high" ? "⚠" : level === "medium" ? "△" : "✓"} {label[level] ?? level}
    </span>
  )
}

export default function PatientHistoryPage() {
  const { user, loading } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const params = useParams()
  const patientId = params?.patient_id as string

  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!user) { router.push("/login"); return }
    if (user.role !== "psychologist") { router.push("/dashboard/paciente"); return }
    if (!patientId) return
    ;(async () => {
      try {
        const res = await fetch(
          `${API}/psychologists/me/patients/${patientId}`,
          { headers: authHeaders() }
        )
        if (res.status === 401) { router.push("/login"); return }
        if (!res.ok) throw new Error("Erro ao carregar histórico do paciente")
        setSessions(await res.json())
      } catch (e: any) {
        toast(e.message, "error")
      } finally {
        setFetching(false)
      }
    })()
  }, [user, loading, router, patientId])

  const paidSessions = sessions.filter((s) => s.status === "paid")
  const highRisk = sessions.filter((s) => s.risk_level === "high").length

  if (loading || fetching) {
    return (
      <div className="grid gap-4 animate-pulse">
        {[1, 2, 3].map((n) => <div key={n} className="card h-20" />)}
      </div>
    )
  }

  return (
    <main className="flex flex-col gap-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-50">Histórico do Paciente</h1>
          <p className="text-sm text-slate-500">{sessions.length} sessões registradas</p>
        </div>
        <Link href="/dashboard/psicologa/pacientes" className="text-xs text-slate-500 hover:text-cyan-300 transition">
          ← Voltar à lista
        </Link>
      </div>

      {/* ── Estatísticas rápidas ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card flex flex-col gap-1 p-4">
          <p className="text-2xl font-bold text-cyan-300 tabular-nums">{paidSessions.length}</p>
          <p className="text-xs text-slate-500">Sessões realizadas</p>
        </div>
        <div className="card flex flex-col gap-1 p-4">
          <p className="text-2xl font-bold text-emerald-300 tabular-nums">
            {sessions.filter((s) => s.has_summary).length}
          </p>
          <p className="text-xs text-slate-500">Com prontuário</p>
        </div>
        <div className="card flex flex-col gap-1 p-4">
          <p className={`text-2xl font-bold tabular-nums ${highRisk > 0 ? "text-red-400" : "text-slate-400"}`}>
            {highRisk}
          </p>
          <p className="text-xs text-slate-500">Risco alto detectado</p>
        </div>
      </div>

      {/* ── Linha do tempo ── */}
      {sessions.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-3xl">📋</p>
          <p className="mt-3 text-slate-400">Nenhuma sessão registrada.</p>
        </div>
      ) : (
        <div className="relative flex flex-col">
          <div className="absolute left-[19px] top-3 bottom-3 w-px bg-gradient-to-b from-cyan-500/40 via-violet-500/20 to-transparent" />
          {sessions.map((s, i) => (
            <div
              key={s.appointment_id}
              className="flex gap-4 pb-4 animate-in fade-in slide-in-from-left-2 duration-300"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {/* Dot */}
              <div className="relative mt-3 flex h-10 w-10 shrink-0 items-center justify-center">
                <div className={[
                  "h-3 w-3 rounded-full shadow-lg",
                  s.risk_level === "high"
                    ? "bg-red-400 shadow-red-500/30"
                    : s.risk_level === "medium"
                    ? "bg-amber-400 shadow-amber-500/30"
                    : "bg-emerald-400 shadow-emerald-500/20",
                ].join(" ")} />
              </div>

              {/* Card */}
              <div className="flex-1 glass rounded-xl px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm capitalize text-slate-200">{fmtDate(s.scheduled_at)}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{s.duration_minutes} min</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {s.has_transcript && (
                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                          📝 Transcrição
                        </span>
                      )}
                      {s.has_summary && (
                        <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                          🤖 Prontuário
                        </span>
                      )}
                      <RiskBadge level={s.risk_level} />
                    </div>
                  </div>
                  {(s.has_transcript || s.has_summary) && (
                    <Link
                      href={`/dashboard/psicologa/sessao/${s.appointment_id}`}
                      className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-cyan-500/40 hover:text-cyan-300"
                    >
                      Ver sessão →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
