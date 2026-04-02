"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react"

import { useAuth } from "@/providers/auth-context"
import { useToast } from "@/components/ui/toast"
import { authHeaders } from "@/lib/auth"

const API = "/api/v1"

const WEEK_DAYS = [
  { value: 0, label: "Segunda-feira" },
  { value: 1, label: "Terça-feira"   },
  { value: 2, label: "Quarta-feira"  },
  { value: 3, label: "Quinta-feira"  },
  { value: 4, label: "Sexta-feira"   },
  { value: 5, label: "Sábado"        },
  { value: 6, label: "Domingo"       },
]

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

function pyToJs(py: number) { return (py + 1) % 7 }

function datesForWeekday(year: number, month: number, pyWeekday: number): number[] {
  const jsDay = pyToJs(pyWeekday)
  const total = new Date(year, month + 1, 0).getDate()
  const result: number[] = []
  for (let d = 1; d <= total; d++) {
    if (new Date(year, month, d).getDay() === jsDay) result.push(d)
  }
  return result
}

function toISO(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

// ── Types ──────────────────────────────────────────────────────────────────────
type Window = { start: string; end: string }

// dateWindows: ISO date string → list of time windows for that date
type DateWindows = Record<string, Window[]>

// ── Toggle switch ──────────────────────────────────────────────────────────────
function Switch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full",
        "border-2 border-transparent transition-colors duration-200 focus-visible:outline-none",
        on ? "bg-cyan-500" : "bg-slate-700",
      ].join(" ")}
    >
      <span className={[
        "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
        on ? "translate-x-5" : "translate-x-0",
      ].join(" ")} />
    </button>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function AvailabilityPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const today = useMemo(() => new Date(), [])
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  /** ISO dates the professional has enabled */
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  /** Per-date time windows — kept in state even when a date is deselected */
  const [dateWindows, setDateWindows] = useState<DateWindows>({})

  const { toast } = useToast()
  const [fetching, setFetching] = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [sessionDuration, setSessionDuration] = useState<number>(50)

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return
    if (!user) { router.push("/login?redirect=/dashboard/psicologa/disponibilidade"); return }
    if (user.role !== "psychologist") { router.push("/dashboard/paciente"); return }
    ;(async () => {
      try {
        const h = authHeaders()
        const profRes = await fetch(`${API}/psychologists/me/profile`, { headers: h })
        if (profRes.status === 401) { router.push("/login?redirect=/dashboard/psicologa/disponibilidade"); return }
        if (!profRes.ok) throw new Error("Erro ao carregar perfil.")
        const prof = await profRes.json()
        const dur = prof.profile?.session_duration_minutes ?? prof.session_duration_minutes
        if (dur) setSessionDuration(dur)

        const detailRes = await fetch(`${API}/psychologists/${prof.profile?.id ?? prof.id}`, { headers: h })
        if (detailRes.ok) {
          const detail = await detailRes.json()
          const avails: Array<{ specificDate: string; start: string; end: string; isActive: boolean }> =
            detail.availabilities ?? []

          const dates = new Set<string>()
          const windows: DateWindows = {}

          avails.forEach((a) => {
            if (!a.isActive) return
            dates.add(a.specificDate)
            if (!windows[a.specificDate]) windows[a.specificDate] = []
            windows[a.specificDate].push({
              start: a.start.slice(0, 5),
              end:   a.end.slice(0, 5),
            })
          })

          // Sort windows per date by start time
          Object.keys(windows).forEach((iso) => {
            windows[iso].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
          })

          setSelectedDates(dates)
          setDateWindows(windows)
        }
      } catch (e: any) {
        toast(e.message, "error")
      } finally {
        setFetching(false)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, router])

  // ── Month nav ─────────────────────────────────────────────────────────────
  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1) }
    else setViewMonth((m) => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1) }
    else setViewMonth((m) => m + 1)
  }

  // ── Date selection ────────────────────────────────────────────────────────
  function toggleDate(iso: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev)
      if (next.has(iso)) {
        next.delete(iso)
      } else {
        next.add(iso)
        // Initialise with one default window if this date has none yet
        if (!dateWindows[iso] || dateWindows[iso].length === 0) {
          setDateWindows((dw) => ({ ...dw, [iso]: [{ start: "09:00", end: "18:00" }] }))
        }
      }
      return next
    })
  }

  function toggleWeekday(pyWeekday: number) {
    const isos = datesForWeekday(viewYear, viewMonth, pyWeekday)
      .map((d) => toISO(viewYear, viewMonth, d))
    const allOn = isos.every((iso) => selectedDates.has(iso))
    setSelectedDates((prev) => {
      const next = new Set(prev)
      if (allOn) {
        isos.forEach((iso) => next.delete(iso))
      } else {
        isos.forEach((iso) => {
          next.add(iso)
          if (!dateWindows[iso] || dateWindows[iso].length === 0) {
            setDateWindows((dw) => ({ ...dw, [iso]: [{ start: "09:00", end: "18:00" }] }))
          }
        })
      }
      return next
    })
  }

  // ── Window CRUD per date ──────────────────────────────────────────────────
  function addWindow(iso: string) {
    setDateWindows((prev) => ({
      ...prev,
      [iso]: [...(prev[iso] ?? []), { start: "09:00", end: "10:00" }],
    }))
  }

  function removeWindow(iso: string, idx: number) {
    setDateWindows((prev) => ({
      ...prev,
      [iso]: (prev[iso] ?? []).filter((_, i) => i !== idx),
    }))
  }

  function updateWindow(iso: string, idx: number, patch: Partial<Window>) {
    setDateWindows((prev) => ({
      ...prev,
      [iso]: (prev[iso] ?? []).map((w, i) => (i === idx ? { ...w, ...patch } : w)),
    }))
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function save() {
    const items: Array<{ specificDate: string; start: string; end: string; isActive: boolean }> = []

    for (const iso of Array.from(selectedDates)) {
      const d = new Date(iso + "T12:00:00")
      if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) continue

      const windows = dateWindows[iso] ?? []
      if (windows.length === 0) {
        toast(`A data ${iso} está selecionada mas não tem nenhum horário configurado.`, "error")
        return
      }
      for (const w of windows) {
        const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
        if (timeToMinutes(w.start) >= timeToMinutes(w.end)) {
          toast(`${label}: o horário de início deve ser anterior ao fim.`, "error")
          return
        }
        const windowMin = timeToMinutes(w.end) - timeToMinutes(w.start)
        if (windowMin < sessionDuration) {
          toast(`${label}: janela de ${windowMin} min é menor que a duração da sessão configurada (${sessionDuration} min). Ajuste a duração da sessão no seu Perfil ou amplie a janela para pelo menos ${sessionDuration} min.`, "error")
          return
        }
        if (windowMin === sessionDuration) {
          toast(`${label}: janela de exatamente ${windowMin} min — apenas 1 horário será gerado nesta janela.`, "success")
        }
        items.push({ specificDate: iso, start: w.start + ":00", end: w.end + ":00", isActive: true })
      }
    }

    setSaving(true)
    try {
      const res = await fetch(`${API}/psychologists/me/availability`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ year: viewYear, month: viewMonth + 1, items }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? "Erro ao salvar disponibilidade.")
      }
      toast(`Disponibilidade de ${MONTH_NAMES[viewMonth]} ${viewYear} salva com sucesso!`, "success")
    } catch (e: any) {
      toast(e.message, "error")
    } finally {
      setSaving(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const weekRows = useMemo(
    () =>
      WEEK_DAYS.map((day) => {
        const dates = datesForWeekday(viewYear, viewMonth, day.value)
        const isos  = dates.map((d) => toISO(viewYear, viewMonth, d))
        const selectedCount = isos.filter((iso) => selectedDates.has(iso)).length
        return {
          ...day,
          dates,
          isos,
          selectedCount,
          allSelected: dates.length > 0 && selectedCount === dates.length,
        }
      }),
    [viewYear, viewMonth, selectedDates]
  )

  const totalThisMonth = Array.from(selectedDates).filter((iso) => {
    const d = new Date(iso + "T12:00:00")
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth
  }).length

  if (loading || fetching) {
    return (
      <div className="grid gap-4 animate-pulse">
        {[1, 2, 3].map((n) => <div key={n} className="card h-24 bg-slate-900/50" />)}
      </div>
    )
  }

  return (
    <main className="flex flex-col gap-6">

      {/* ── Header ── */}
      <div className="card relative overflow-hidden p-6 md:p-8">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">Painel profissional</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-50">Disponibilidade</h1>
            <p className="mt-1 text-sm text-slate-400">
              Selecione as datas e configure quantos horários quiser em cada uma.
            </p>
          </div>
          <Link
            href="/dashboard/psicologa"
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 md:mt-0"
          >
            ← Voltar ao painel
          </Link>
        </div>
      </div>

      {/* ── Month/year nav ── */}
      <div className="card p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">Mês de referência</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Clique nas datas para selecionar. Configure os horários de cada data individualmente.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} aria-label="Mês anterior"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[11rem] text-center text-sm font-semibold text-slate-50">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} aria-label="Próximo mês"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3">
          <span className={[
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            totalThisMonth > 0 ? "bg-cyan-500/15 text-cyan-300" : "bg-slate-800 text-slate-500",
          ].join(" ")}>
            <span className={["h-1.5 w-1.5 rounded-full", totalThisMonth > 0 ? "bg-cyan-400" : "bg-slate-600"].join(" ")} />
            {totalThisMonth === 0
              ? "Nenhuma data selecionada neste mês"
              : `${totalThisMonth} dia${totalThisMonth > 1 ? "s" : ""} selecionado${totalThisMonth > 1 ? "s" : ""} em ${MONTH_NAMES[viewMonth]}`}
          </span>
        </div>
      </div>

      {/* ── Weekday rows ── */}
      <div className="grid gap-4">
        {weekRows.map((day) => {
          const hasAny = day.selectedCount > 0
          const selectedIsos = day.isos.filter((iso) => selectedDates.has(iso))

          return (
            <div key={day.value} className={["card p-4 md:p-5 transition-all duration-200", !hasAny && "opacity-55"].join(" ")}>

              {/* ── Date chips row ── */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className={["text-sm font-semibold", hasAny ? "text-slate-100" : "text-slate-500"].join(" ")}>
                      {day.label}
                    </h2>
                    {hasAny && (
                      <span className="text-[10px] text-slate-500">{day.selectedCount} de {day.dates.length}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {day.isos.map((iso, idx) => {
                      const selected = selectedDates.has(iso)
                      const windowCount = (dateWindows[iso] ?? []).length
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => toggleDate(iso)}
                          aria-pressed={selected}
                          aria-label={`Dia ${day.dates[idx]} de ${MONTH_NAMES[viewMonth]}`}
                          className={[
                            "relative inline-flex h-9 w-9 items-center justify-center rounded-full",
                            "text-sm font-semibold transition-all duration-150",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900",
                            selected
                              ? "bg-cyan-500 text-slate-950 shadow-lg scale-110"
                              : "border border-white/10 bg-slate-800/60 text-slate-400 hover:border-cyan-500/40 hover:text-slate-200 hover:scale-105",
                          ].join(" ")}
                        >
                          {day.dates[idx]}
                          {/* Dot indicator: how many windows this date has */}
                          {selected && windowCount > 0 && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-slate-950 px-1 text-[8px] font-bold text-cyan-300 leading-none py-0.5">
                              {windowCount}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
                  <span className="text-[10px] text-slate-500 hidden sm:block">
                    {day.allSelected ? "Todos" : "Selecionar todos"}
                  </span>
                  <Switch on={day.allSelected} onChange={() => toggleWeekday(day.value)} />
                </div>
              </div>

              {/* ── Per-date windows ── */}
              {hasAny && (
                <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                  {selectedIsos.map((iso) => {
                    const windows = dateWindows[iso] ?? []
                    const dayNum = parseInt(iso.split("-")[2], 10)
                    const label = `${String(dayNum).padStart(2, "0")}/${String(viewMonth + 1).padStart(2, "0")}`

                    return (
                      <div key={iso} className="rounded-xl border border-white/5 bg-slate-900/40 p-3">
                        {/* Date label */}
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-semibold text-cyan-300">{label}</span>
                          <span className="text-[10px] text-slate-500">
                            {windows.length} horário{windows.length !== 1 ? "s" : ""}
                          </span>
                        </div>

                        {/* Windows list */}
                        {windows.length === 0 ? (
                          <p className="text-xs text-slate-600">Nenhum horário. Adicione abaixo.</p>
                        ) : (
                          <div className="space-y-2">
                            {windows.map((w, idx) => (
                              <div key={idx} className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-slate-500 w-6 text-right">{idx + 1}.</span>
                                <input
                                  type="time"
                                  value={w.start}
                                  onChange={(e) => updateWindow(iso, idx, { start: e.target.value })}
                                  className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-cyan-400 transition-colors"
                                />
                                <span className="text-xs text-slate-500">às</span>
                                <input
                                  type="time"
                                  value={w.end}
                                  onChange={(e) => updateWindow(iso, idx, { end: e.target.value })}
                                  className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-cyan-400 transition-colors"
                                />
                                <button
                                  onClick={() => removeWindow(iso, idx)}
                                  aria-label="Remover horário"
                                  className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add window button */}
                        <button
                          onClick={() => addWindow(iso)}
                          className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-white/10 px-3 py-1.5 text-xs text-slate-500 hover:border-cyan-500/30 hover:text-cyan-400 transition-colors w-full justify-center"
                        >
                          <Plus className="h-3 w-3" />
                          Adicionar horário
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Hint duração ── */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-300">
        ℹ️ Sua sessão dura <strong>{sessionDuration} min</strong>. Cada janela de disponibilidade precisa ter pelo menos <strong>{sessionDuration} minutos</strong> para gerar um horário disponível.
      </div>

      {/* ── Save ── */}
      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-8 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60 transition-all"
        >
          {saving ? "Salvando…" : `Salvar ${MONTH_NAMES[viewMonth]}`}
        </button>
      </div>

    </main>
  )
}
