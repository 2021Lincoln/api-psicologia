"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { useAuth } from "@/providers/auth-context"
import { useToast } from "@/components/ui/toast"
import { authHeaders } from "@/lib/auth"

type Appointment = {
  id: string
  psychologist_profile_id: string
  scheduled_at: string
  status: "pending" | "paid" | "cancelled"
  price: string
  duration_minutes?: number | null
  daily_room_url?: string | null
}

const API = "/api/v1"

function fmtShort(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtBRL(v: string) {
  return parseFloat(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function isUpcoming(iso: string) { return new Date(iso) > new Date() }
function isWithin5Min(iso: string) { return new Date(iso).getTime() - Date.now() <= 5 * 60_000 }
function isSessionActive(iso: string, dur: number) {
  return Date.now() < new Date(iso).getTime() + dur * 60_000
}
function isWithin3Hours(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  return ms > 0 && ms < 3 * 3_600_000
}

function isToday(iso: string) {
  const d = new Date(iso), n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

function greeting(name: string) {
  const h = new Date().getHours()
  const s = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"
  return `${s}, ${name.split(" ")[0]}`
}

function todayFmt() {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })
}

function initials(name?: string | null) {
  return (name ?? "?").split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

function useCountdown(iso: string) {
  const [text, setText] = useState("")
  useEffect(() => {
    function calc() {
      const diff = new Date(iso).getTime() - Date.now()
      if (diff <= 0) { setText("Agora!"); return }
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      const s = Math.floor((diff % 60_000) / 1_000)
      if (h >= 48) setText(`${Math.floor(h / 24)} dias`)
      else if (h >= 1) setText(`${h}h ${m}m`)
      else setText(`${m}m ${s}s`)
    }
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [iso])
  return text
}

function useCounter(target: number) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (target === 0) { setN(0); return }
    let c = 0
    const step = Math.max(1, Math.ceil(target / 25))
    const id = setInterval(() => {
      c = Math.min(c + step, target)
      setN(c)
      if (c >= target) clearInterval(id)
    }, 28)
    return () => clearInterval(id)
  }, [target])
  return target === 0 ? 0 : n
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const display = useCounter(value)
  return (
    <div className="card flex flex-col gap-1 p-4">
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{display}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  )
}

// Sessão de hoje (para paciente)
function TodayCard({ appt }: {
  appt: Appointment
}) {
  const countdown = useCountdown(appt.scheduled_at)
  const dur = appt.duration_minutes ?? 60
  const active = isSessionActive(appt.scheduled_at, dur)
  const ended = !active

  return (
    <div className={[
      "flex items-center gap-4 rounded-2xl border p-4 transition",
      ended
        ? "border-slate-700/50 bg-slate-900/30 opacity-60"
        : appt.status === "paid"
          ? "border-cyan-500/30 bg-cyan-500/5"
          : "border-amber-500/30 bg-amber-500/5",
    ].join(" ")}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-violet-500 text-xs font-bold text-slate-950">
        🧠
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-100">Sessão de terapia</p>
        <p className="text-xs text-slate-500">{fmtTime(appt.scheduled_at)} · {fmtBRL(appt.price)}</p>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {active && (
          <span className={`pill text-xs font-mono font-semibold ${
            appt.status === "paid"
              ? "bg-cyan-500/20 text-cyan-300 animate-pulse"
              : "bg-amber-500/20 text-amber-300"
          }`}>
            {appt.status === "paid" ? `⏱ ${countdown}` : "💳 Pendente"}
          </span>
        )}
        {appt.status === "paid" && appt.daily_room_url && active && (
          isWithin5Min(appt.scheduled_at)
            ? <a href={appt.daily_room_url} target="_blank" rel="noopener noreferrer"
                className="rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:brightness-110">
                Entrar
              </a>
            : <span className="text-[10px] text-slate-500">🔒 sala abre em 5 min</span>
        )}
        {appt.status === "pending" && active && (
          <Link href={`/checkout/${appt.id}`}
            className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-300 hover:border-amber-400">
            Pagar
          </Link>
        )}
        {ended && <span className="text-xs text-slate-600">Encerrada</span>}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PatientDashboard() {
  const { user, loading } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const [items, setItems] = useState<Appointment[]>([])
  const [fetching, setFetching] = useState(true)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [reviewModalId, setReviewModalId] = useState<string | null>(null)
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (loading) return
    if (!user) { router.push("/login?redirect=/dashboard/paciente"); return }
    if (user.role !== "patient") { router.push("/dashboard/psicologa"); return }
    ;(async () => {
      try {
        const h = authHeaders()
        const res = await fetch(`${API}/appointments/me/patient`, { headers: h })
        if (res.status === 401) { router.push("/login?redirect=/dashboard/paciente"); return }
        if (!res.ok) throw new Error("Erro ao carregar histórico")
        const list: Appointment[] = await res.json()
        setItems(list)

        // Pre-check which past paid appointments already have a review
        const pastPaid = list.filter(
          (a) => a.status === "paid" && !isUpcoming(a.scheduled_at)
        )
        const checks = await Promise.allSettled(
          pastPaid.map((a) =>
            fetch(`${API}/appointments/${a.id}/review`, { headers: h }).then((r) =>
              r.ok ? r.json() : null
            )
          )
        )
        const alreadyReviewed = new Set<string>()
        checks.forEach((result, idx) => {
          if (result.status === "fulfilled" && result.value) {
            alreadyReviewed.add(pastPaid[idx].id)
          }
        })
        setReviewedIds(alreadyReviewed)
      } catch (e: any) {
        toast(e.message, "error")
      } finally {
        setFetching(false)
      }
    })()
  }, [user, loading, router])

  async function cancelAppointment(id: string) {
    if (!confirm("Tem certeza que deseja cancelar esta consulta?")) return
    setCancellingId(id)
    try {
      const res = await fetch(`${API}/appointments/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? "Erro ao cancelar consulta.")
      }
      setItems((prev) => prev.map((a) => a.id === id ? { ...a, status: "cancelled" } : a))
      toast("Consulta cancelada.", "info")
    } catch (e: any) {
      toast(e.message, "error")
    } finally {
      setCancellingId(null)
    }
  }

  const upcoming = useMemo(
    () => items
      .filter((a) => a.status !== "cancelled" && isUpcoming(a.scheduled_at))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [items]
  )
  const past = useMemo(
    () => items
      .filter((a) => !isUpcoming(a.scheduled_at) || a.status === "cancelled")
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()),
    [items]
  )
  const todaySessions = useMemo(
    () => items.filter((a) => a.status !== "cancelled" && isToday(a.scheduled_at))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [items]
  )
  const nextNotToday = upcoming.find((a) => !isToday(a.scheduled_at)) ?? null
  const totalDone = past.filter((a) => a.status === "paid").length
  const pendingCount = items.filter((a) => a.status === "pending").length
  const ini = initials(user?.full_name)

  if (loading || fetching) {
    return (
      <div className="grid gap-4 animate-pulse">
        {[1, 2, 3].map((n) => (
          <div key={n} className="card h-24 bg-slate-900/50" />
        ))}
      </div>
    )
  }

  return (
    <main className="flex flex-col gap-6">

      {/* ── Hero ── */}
      <div className="card relative overflow-hidden p-6 md:p-7">
        <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-cyan-500/8 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-violet-500/8 blur-2xl pointer-events-none" />
        <div className="relative flex items-start gap-4">
          {/* Avatar */}
          <div className="shrink-0 h-16 w-16 rounded-2xl overflow-hidden border border-white/10 shadow-lg">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.full_name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500/30 to-violet-500/30 text-xl font-bold text-slate-100">
                {ini}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs capitalize text-slate-500">{todayFmt()}</p>
            <h1 className="mt-0.5 text-xl font-semibold text-slate-50">
              {greeting(user?.full_name ?? "Paciente")} 👋
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {upcoming.length > 0
                ? `Você tem ${upcoming.length} consulta${upcoming.length > 1 ? "s" : ""} agendada${upcoming.length > 1 ? "s" : ""}.`
                : "Nenhuma consulta agendada no momento."}
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 hidden sm:inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 transition-all"
          >
            + Agendar
          </Link>
        </div>
        {/* Mobile: botão agendar abaixo */}
        <div className="relative mt-4 sm:hidden">
          <Link
            href="/"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-110 transition-all"
          >
            + Agendar nova consulta
          </Link>
        </div>
      </div>

      {/* ── Sessões de hoje ── */}
      {todaySessions.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Hoje</h2>
            <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
              {todaySessions.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {todaySessions.map((a) => (
              <TodayCard key={a.id} appt={a} />
            ))}
          </div>
        </section>
      )}

      {/* ── Stats animados ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Próximas consultas"  value={upcoming.length} color="text-cyan-300" />
        <StatCard label="Consultas realizadas" value={totalDone}       color="text-emerald-300" />
        <StatCard label="Aguardando pagamento" value={pendingCount}    color="text-amber-300" />
      </div>

      {/* ── Próxima consulta em destaque (não hoje) ── */}
      {nextNotToday && (
        <div className="card relative overflow-hidden p-5 md:p-6">
          <div className="absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-gradient-to-b from-cyan-400 to-violet-500" />
          <div className="pl-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs uppercase tracking-widest text-slate-500">Próxima consulta</p>
              <NextCountdown iso={nextNotToday.scheduled_at} />
            </div>
            <p className="mt-2 text-lg font-semibold capitalize text-slate-50">
              {fmtDate(nextNotToday.scheduled_at)}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {fmtBRL(nextNotToday.price)} ·{" "}
              {nextNotToday.status === "paid"
                ? <span className="text-emerald-300">Pago</span>
                : <span className="text-amber-300">Aguardando pagamento</span>}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {nextNotToday.status === "paid" && nextNotToday.daily_room_url && (
                isWithin5Min(nextNotToday.scheduled_at)
                  ? <a href={nextNotToday.daily_room_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-110">
                      Entrar na sala de vídeo
                    </a>
                  : <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm text-slate-500">
                      🔒 Sala disponível 5 min antes
                    </span>
              )}
              {nextNotToday.status === "pending" && (
                <Link href={`/checkout/${nextNotToday.id}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 px-5 py-2.5 text-sm font-semibold text-amber-300 hover:border-amber-400">
                  Confirmar pagamento
                </Link>
              )}
              {nextNotToday.status !== "cancelled" && (
                isWithin3Hours(nextNotToday.scheduled_at)
                  ? <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-600 cursor-not-allowed">
                      🔒 Cancelamento até 3h antes
                    </span>
                  : <button onClick={() => cancelAppointment(nextNotToday.id)} disabled={cancellingId === nextNotToday.id}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-2.5 text-sm text-red-400 hover:border-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors">
                      {cancellingId === nextNotToday.id ? "Cancelando…" : "Cancelar consulta"}
                    </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {items.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-4xl">🔍</p>
          <p className="mt-3 text-lg text-slate-300">Sem consultas agendadas</p>
          <p className="mt-1 text-sm text-slate-500">Encontre uma psicóloga e agende sua primeira sessão.</p>
          <Link href="/"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:brightness-110">
            Buscar psicólogas
          </Link>
        </div>
      )}

      {/* ── Timeline de próximas (não hoje) ── */}
      {upcoming.filter((a) => !isToday(a.scheduled_at)).length > (nextNotToday ? 1 : 0) && (
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Agendadas ({upcoming.filter((a) => !isToday(a.scheduled_at)).length - (nextNotToday ? 1 : 0)})
          </h2>
          <div className="relative flex flex-col">
            <div className="absolute left-[19px] top-3 bottom-3 w-px bg-gradient-to-b from-cyan-500/40 via-violet-500/20 to-transparent" />
            {upcoming.filter((a) => !isToday(a.scheduled_at)).slice(nextNotToday ? 1 : 0).map((appt, i) => (
              <TimelineRow key={appt.id} appt={appt} index={i}
                onCancel={cancelAppointment} cancelling={cancellingId === appt.id} />
            ))}
          </div>
        </section>
      )}

      {/* ── Histórico ── */}
      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Histórico
          </h2>
          <div className="flex flex-col gap-2">
            {past.map((appt) => (
              <ApptRow key={appt.id} appt={appt}
                onCancel={cancelAppointment} cancelling={cancellingId === appt.id}
                reviewed={reviewedIds.has(appt.id)}
                onReview={(id) => setReviewModalId(id)} />
            ))}
          </div>
        </section>
      )}

      {/* ── Modal de avaliação ── */}
      {reviewModalId && (
        <ReviewModal
          apptId={reviewModalId}
          onClose={() => setReviewModalId(null)}
          onSubmitted={(id) => setReviewedIds((prev) => new Set(prev).add(id))}
        />
      )}
    </main>
  )
}

// ── Countdown badge ────────────────────────────────────────────────────────────

function NextCountdown({ iso }: { iso: string }) {
  const text = useCountdown(iso)
  const today = new Date(iso).toDateString() === new Date().toDateString()
  if (!text) return null
  return (
    <span className={[
      "pill text-xs font-mono font-semibold",
      today ? "bg-cyan-500/25 text-cyan-200 animate-pulse" : "bg-cyan-500/15 text-cyan-300",
    ].join(" ")}>
      {today ? "⏱" : "⌛"} {text}
    </span>
  )
}

// ── Timeline row ───────────────────────────────────────────────────────────────

function TimelineRow({ appt, index, onCancel, cancelling }: {
  appt: Appointment; index: number
  onCancel: (id: string) => void; cancelling: boolean
}) {
  const up = isUpcoming(appt.scheduled_at)
  const active = isSessionActive(appt.scheduled_at, appt.duration_minutes ?? 60)
  const today = new Date(appt.scheduled_at).toDateString() === new Date().toDateString()
  return (
    <div className="flex gap-4 pb-4 animate-in fade-in slide-in-from-left-2 duration-300"
      style={{ animationDelay: `${index * 60}ms` }}>
      <div className="relative mt-3 flex h-10 w-10 shrink-0 items-center justify-center">
        <div className={[
          "h-3 w-3 rounded-full shadow-lg",
          appt.status === "paid" ? "bg-emerald-400 shadow-emerald-500/30"
            : today ? "bg-cyan-400 shadow-cyan-500/30 animate-pulse"
            : "bg-violet-400 shadow-violet-500/20",
        ].join(" ")} />
      </div>
      <div className="flex-1 glass rounded-xl px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm capitalize text-slate-200">{fmtShort(appt.scheduled_at)}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {appt.status === "paid" ? "Pago" : "Pendente"} · {parseFloat(appt.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </div>
          <div className="flex gap-2">
            {appt.status === "paid" && appt.daily_room_url && active && (
              isWithin5Min(appt.scheduled_at)
                ? <a href={appt.daily_room_url} target="_blank" rel="noopener noreferrer"
                    className="rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-slate-950">
                    Entrar
                  </a>
                : <span className="text-[10px] text-slate-500">🔒 5 min antes</span>
            )}
            {appt.status === "pending" && (
              <Link href={`/checkout/${appt.id}`}
                className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-300">
                Pagar
              </Link>
            )}
            {appt.status !== "cancelled" && up && (
              isWithin3Hours(appt.scheduled_at)
                ? <span className="text-[10px] text-slate-600" title="Cancelamento não permitido com menos de 3h de antecedência">🔒 3h antes</span>
                : <button onClick={() => onCancel(appt.id)} disabled={cancelling}
                    className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                    {cancelling ? "…" : "Cancelar"}
                  </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Review modal ──────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button" onClick={() => onChange(star)}
          className="text-2xl transition-transform hover:scale-110 focus:outline-none">
          <span className={star <= value ? "text-amber-400" : "text-slate-700"}>★</span>
        </button>
      ))}
    </div>
  )
}

function ReviewModal({ apptId, onClose, onSubmitted }: {
  apptId: string
  onClose: () => void
  onSubmitted: (apptId: string) => void
}) {
  const { toast } = useToast()
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch(`${API}/appointments/${apptId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ rating, comment: comment.trim() || null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? "Erro ao enviar avaliação.")
      }
      toast("Avaliação enviada! Obrigado pelo feedback.", "success")
      onSubmitted(apptId)
      onClose()
    } catch (e: any) {
      toast(e.message, "error")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-50">Avaliar consulta</h2>
        <p className="mt-1 text-sm text-slate-400">
          Sua avaliação é anônima e ajuda outros pacientes.
        </p>
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Nota
            </label>
            <StarRating value={rating} onChange={setRating} />
            <p className="text-xs text-slate-500">
              {["", "Muito ruim", "Ruim", "Regular", "Bom", "Excelente"][rating]}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Comentário (opcional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="Como foi a consulta? O que achou da profissional?"
              className="w-full resize-none rounded-xl border border-white/10 bg-slate-800/60 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-500/50 transition-colors"
            />
            <p className="text-right text-[10px] text-slate-600">{comment.length}/1000</p>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={submitting}
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60 transition-all">
              {submitting ? "Enviando…" : "Enviar avaliação"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── History row ────────────────────────────────────────────────────────────────

function ApptRow({ appt, onCancel, cancelling, reviewed, onReview }: {
  appt: Appointment
  onCancel: (id: string) => void
  cancelling: boolean
  reviewed: boolean
  onReview: (id: string) => void
}) {
  const up = isUpcoming(appt.scheduled_at)
  const canReview = appt.status === "paid" && !up && !reviewed
  return (
    <div className="glass flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className={`h-2 w-2 shrink-0 rounded-full ${
          appt.status === "paid" ? "bg-emerald-400"
          : appt.status === "cancelled" ? "bg-red-400"
          : "bg-amber-400"
        }`} />
        <div>
          <p className="text-sm capitalize text-slate-200">{fmtShort(appt.scheduled_at)}</p>
          <p className="text-xs text-slate-500">
            {appt.status === "paid" ? "Pago" : appt.status === "cancelled" ? "Cancelado" : "Pendente"}{" "}
            · {parseFloat(appt.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {appt.status === "paid" && appt.daily_room_url && isSessionActive(appt.scheduled_at, appt.duration_minutes ?? 60) && (
          isWithin5Min(appt.scheduled_at)
            ? <a href={appt.daily_room_url} target="_blank" rel="noopener noreferrer"
                className="rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-slate-950">
                Entrar
              </a>
            : <span className="text-[10px] text-slate-500">🔒 5 min antes</span>
        )}
        {appt.status === "pending" && up && (
          <Link href={`/checkout/${appt.id}`}
            className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-300">
            Pagar
          </Link>
        )}
        {canReview && (
          <button onClick={() => onReview(appt.id)}
            className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs text-amber-300 hover:border-amber-400 hover:bg-amber-500/10 transition-colors">
            ★ Avaliar
          </button>
        )}
        {reviewed && appt.status === "paid" && !up && (
          <span className="rounded-lg border border-emerald-500/20 px-3 py-1.5 text-xs text-emerald-500">
            ✓ Avaliado
          </span>
        )}
        {appt.status !== "cancelled" && up && (
          <button onClick={() => onCancel(appt.id)} disabled={cancelling}
            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50">
            {cancelling ? "…" : "Cancelar"}
          </button>
        )}
      </div>
    </div>
  )
}
