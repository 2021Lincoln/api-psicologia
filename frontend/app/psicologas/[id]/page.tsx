"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/providers/auth-context"
import { authHeaders } from "@/lib/auth"
import { getAccent } from "@/lib/accent-colors"

const API = "/api/v1"

type PsychologistDetail = {
  profile: {
    id: string
    user_id: string
    crp: string
    bio: string | null
    specialties: string | null
    hourly_rate: string
    session_duration_minutes: number
    is_accepting_patients: boolean
    gender: string | null
    accent_color: string | null
    user?: { full_name: string; avatar_url?: string | null } | null
  }
  availabilities: {
    id: string
    specificDate: string
    start: string
    end: string
    isActive: boolean
  }[]
}

type Slot = { start: string; end: string; duration_minutes: number }

type ReviewItem = {
  id: string
  rating: number
  comment: string | null
  patient_name: string | null
  created_at: string
}

type ReviewsData = {
  reviews: ReviewItem[]
  avg_rating: number | null
  total: number
}

function Stars({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  return (
    <span className={size === "md" ? "text-lg" : "text-sm"}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= Math.round(value) ? "text-amber-400" : "text-slate-200"}>★</span>
      ))}
    </span>
  )
}

export default function PsychologistPage({ params }: { params: { id: string } }) {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const psychologistId = params?.id
  const hasValidId = Boolean(psychologistId) && psychologistId !== "undefined"
  const [date, setDate] = useState(() => searchParams.get("date") ?? today())
  const [detail, setDetail] = useState<PsychologistDetail | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booking, setBooking] = useState<string | null>(null)
  const [bookError, setBookError] = useState<string | null>(null)
  const [reviewsData, setReviewsData] = useState<ReviewsData | null>(null)

  const friendlyDays = useMemo(() => {
    if (!detail) return ""
    const WEEK_DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
    const days = Array.from(
      new Set(detail.availabilities.map((a) => new Date(a.specificDate + "T12:00:00").getDay()))
    ).sort()
    return days.map((d) => WEEK_DAYS_PT[d]).join(" · ")
  }, [detail])

  useEffect(() => {
    if (!hasValidId) return
    ;(async () => {
      try {
        const [detailRes, reviewsRes] = await Promise.all([
          fetch(`${API}/psychologists/${psychologistId}`, { cache: "no-store" }),
          fetch(`${API}/psychologists/${psychologistId}/reviews`, { cache: "no-store" }),
        ])
        if (!detailRes.ok) throw new Error("Perfil não encontrado")
        setDetail(await detailRes.json())
        if (reviewsRes.ok) setReviewsData(await reviewsRes.json())
      } catch (err: any) {
        setError(err.message)
      }
    })()
  }, [hasValidId, psychologistId])

  async function loadSlots(d: string) {
    if (!hasValidId) return
    setLoading(true)
    setSlots([])
    setBookError(null)
    try {
      const res = await fetch(`${API}/psychologists/${psychologistId}/slots?day=${d}&tz=America/Sao_Paulo`, { cache: "no-store" })
      if (!res.ok) throw new Error("Falha ao buscar horários")
      setSlots(await res.json())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!hasValidId) return
    loadSlots(date)
  }, [hasValidId, psychologistId, date])

  async function reservar(slot: Slot) {
    if (!hasValidId) return
    if (!user) {
      router.push(`/login?redirect=/psicologas/${psychologistId}?date=${date}`)
      return
    }
    setBooking(slot.start)
    setBookError(null)
    try {
      const res = await fetch(`${API}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          psychologist_id: psychologistId,
          scheduled_at: slot.start,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? "Erro ao reservar horário.")
      }
      const data = await res.json()
      router.push(`/checkout/${data.appointment_id}`)
    } catch (err: any) {
      setBookError(err.message)
    } finally {
      setBooking(null)
    }
  }

  const genderTitle = detail?.profile.gender === "F" ? "Psicóloga" : detail?.profile.gender === "M" ? "Psicólogo" : "Psicólogo(a)"
  const displayName = detail?.profile.user?.full_name ?? genderTitle
  const accent = getAccent(detail?.profile.accent_color)
  const avatarUrl = detail?.profile.user?.avatar_url ?? null
  const initials = displayName.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
  const canBook = !user || user.role === "patient"

  return (
    <main className="flex flex-col gap-6">
      {/* Back link */}
      <a
        href="/#profissionais"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Voltar à busca
      </a>

      {/* ── Profile header ── */}
      {detail ? (
        <div className="card overflow-hidden">
          {/* Gradient banner */}
          <div className="h-24" style={{ background: accent.gradient }} />

          <div className="px-6 pb-6">
            {/* Avatar overlapping banner */}
            <div className="relative -mt-12 flex items-end justify-between gap-4">
              <div className="shrink-0 h-24 w-24 rounded-2xl overflow-hidden border-4 border-white bg-white shadow-lg ring-1 ring-slate-200">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-white" style={{ background: accent.gradient }}>
                    {initials}
                  </div>
                )}
              </div>

              <div className="mb-1 text-right">
                <p className="text-2xl font-bold drop-shadow-sm" style={{ color: accent.onGradient }}>
                  {formatPrice(detail.profile.hourly_rate, detail.profile.session_duration_minutes)}
                </p>
                <p className="text-xs mt-0.5 text-slate-500">
                  {detail.profile.session_duration_minutes} min · {friendlyDays || "Consulte horários"}
                </p>
                {reviewsData && reviewsData.total > 0 && (
                  <div className="mt-1 flex items-center justify-end gap-1.5">
                    <Stars value={reviewsData.avg_rating ?? 0} />
                    <span className="text-xs font-semibold text-slate-700">{reviewsData.avg_rating?.toFixed(1)}</span>
                    <span className="text-xs text-slate-400">({reviewsData.total})</span>
                  </div>
                )}
              </div>
            </div>

            {/* Name + badges */}
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  ✓ CRP {detail.profile.crp} · {detail.profile.gender === "F" ? "Verificada" : "Verificado"}
                </span>
                {!detail.profile.is_accepting_patients && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                    Agenda fechada
                  </span>
                )}
                {detail.profile.is_accepting_patients && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
                    Agenda aberta
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
            </div>

            {/* Bio + specialties */}
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Bio</p>
                <p className="text-sm leading-relaxed text-slate-700">{detail.profile.bio ?? "Sem bio informada."}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Especialidades</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.profile.specialties
                    ? detail.profile.specialties.split(/[,;]/).map((s) => s.trim()).filter(Boolean).map((sp) => (
                        <span key={sp} className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                          {sp}
                        </span>
                      ))
                    : <p className="text-sm text-slate-500">Especialidades não informadas.</p>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-6">
          {error
            ? <p className="text-sm text-red-600">{error}</p>
            : (
              <div className="flex items-center gap-3">
                <div className="skeleton h-16 w-16 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-5 w-1/3" />
                  <div className="skeleton h-4 w-1/2" />
                </div>
              </div>
            )
          }
        </div>
      )}

      {/* ── Booking ── */}
      {canBook ? (
        detail?.profile.is_accepting_patients === false ? (
          <section className="card p-6 md:p-8">
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 border border-amber-200">
                <svg className="h-7 w-7 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-amber-700">Agenda fechada</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Esta psicóloga não está aceitando novos agendamentos no momento.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Tente voltar mais tarde ou busque outra profissional disponível.
                </p>
              </div>
              <a
                href="/"
                className="mt-1 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Ver outras psicólogas
              </a>
            </div>
          </section>
        ) : (
          <section className="card p-6 md:p-7">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Horários disponíveis</h2>
                <p className="text-sm text-slate-500">Escolha uma data para ver os horários livres.</p>
              </div>
              <input
                type="date"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {bookError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {bookError}
              </p>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {slots.map((s) => (
                <div
                  key={s.start}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-300 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">
                      {formatTime(s.start)} — {formatTime(s.end)}
                    </span>
                    <span className="rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      {s.duration_minutes} min
                    </span>
                  </div>
                  <button
                    onClick={() => reservar(s)}
                    disabled={booking === s.start}
                    className="mt-1 inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-sky-400 to-indigo-400 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-sky-500 hover:to-indigo-500 hover:shadow-md disabled:opacity-60"
                  >
                    {booking === s.start ? "Reservando..." : user ? "Reservar horário" : "Entrar para reservar"}
                  </button>
                </div>
              ))}
              {slots.length === 0 && !loading && (
                <div className="col-span-full py-6 text-center">
                  <p className="text-sm text-slate-500">Nenhum horário disponível para essa data.</p>
                  <p className="mt-1 text-xs text-slate-400">Tente outra data.</p>
                </div>
              )}
            </div>
            {loading && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="skeleton h-20 rounded-xl" />
                ))}
              </div>
            )}
          </section>
        )
      ) : (
        <div className="card p-6 text-center">
          <p className="text-sm text-slate-500">
            Esta área é destinada a pacientes para agendamento de sessões.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Acesse o seu{" "}
            <a href="/dashboard/psicologa" className="font-medium text-cyan-600 hover:underline">
              painel profissional
            </a>{" "}
            para gerenciar sua agenda.
          </p>
        </div>
      )}

      {/* ── Reviews ── */}
      {reviewsData && reviewsData.total > 0 && (
        <section className="card p-6">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">Avaliações</h2>
            <div className="flex items-center gap-2">
              <Stars value={reviewsData.avg_rating ?? 0} size="md" />
              <span className="text-base font-bold text-amber-600">
                {reviewsData.avg_rating?.toFixed(1)}
              </span>
              <span className="text-sm text-slate-400">
                ({reviewsData.total} avaliação{reviewsData.total !== 1 ? "ões" : ""})
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {reviewsData.reviews.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 text-xs font-bold text-white shadow-sm">
                      {(r.patient_name ?? "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {r.patient_name ?? "Paciente anônimo"}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(r.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <Stars value={r.rating} />
                </div>
                {r.comment && (
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{r.comment}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

function today() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
}

function formatPrice(hourlyRate: string, durationMinutes: number) {
  const price = (parseFloat(hourlyRate) * durationMinutes) / 60
  return price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
