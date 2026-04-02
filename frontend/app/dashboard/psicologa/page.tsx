"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { useAuth } from "@/providers/auth-context"
import { useToast } from "@/components/ui/toast"
import { authHeaders } from "@/lib/auth"

type NoteItem = { id: string; content: string; created_at: string }

type Profile = {
  id: string
  is_verified: boolean
  crp: string
  is_accepting_patients: boolean
  bio: string | null
  specialties: string | null
  hourly_rate: string
  session_duration_minutes: number
}

type Appointment = {
  id: string
  patient_id: string
  patient_full_name?: string | null
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

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtBRL(v: string | number) {
  return parseFloat(String(v)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function isUpcoming(iso: string) { return new Date(iso) > new Date() }
function isWithin5Min(iso: string) { return new Date(iso).getTime() - Date.now() <= 5 * 60_000 }
function isSessionActive(iso: string, dur: number) {
  return Date.now() < new Date(iso).getTime() + dur * 60_000
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
      if (h >= 48) setText(`${Math.floor(h / 24)}d`)
      else if (h >= 1) setText(`${h}h ${m}m`)
      else setText(`${m}m ${Math.floor((diff % 60_000) / 1_000)}s`)
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
    const id = setInterval(() => { c = Math.min(c + step, target); setN(c); if (c >= target) clearInterval(id) }, 28)
    return () => clearInterval(id)
  }, [target])
  return target === 0 ? 0 : n
}

// ── Componentes ────────────────────────────────────────────────────────────────

// Ação rápida com ícone
function QuickAction({ href, icon, label, sub, accent }: {
  href: string; icon: React.ReactNode; label: string; sub: string; accent: string
}) {
  return (
    <Link href={href}
      className="group card flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${accent} shadow-sm`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-100 group-hover:text-white">{label}</p>
        <p className="text-xs text-slate-500">{sub}</p>
      </div>
    </Link>
  )
}

// Sessão de hoje
function TodayCard({ appt }: { appt: Appointment }) {
  const countdown = useCountdown(appt.scheduled_at)
  const ini = initials(appt.patient_full_name)
  const dur = appt.duration_minutes ?? 60
  const active = isSessionActive(appt.scheduled_at, dur)
  const ended = !active

  return (
    <div className={[
      "flex items-center gap-4 rounded-2xl border p-4 transition",
      ended
        ? "border-slate-700/50 bg-slate-900/30 opacity-60"
        : appt.status === "paid"
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5",
    ].join(" ")}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 text-xs font-bold text-slate-950">
        {ini}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-100">{appt.patient_full_name ?? "Paciente"}</p>
        <p className="text-xs text-slate-500">{fmtTime(appt.scheduled_at)} · {fmtBRL(appt.price)}</p>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {active && countdown && (
          <span className={`pill text-xs font-mono font-semibold ${
            appt.status === "paid"
              ? "bg-emerald-500/20 text-emerald-300 animate-pulse"
              : "bg-amber-500/20 text-amber-300"
          }`}>
            {appt.status === "paid" ? `⏱ ${countdown}` : "💳 Pendente"}
          </span>
        )}
        {appt.status === "paid" && appt.daily_room_url && active && (
          isWithin5Min(appt.scheduled_at)
            ? <a href={appt.daily_room_url} target="_blank" rel="noopener noreferrer"
                className="rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:brightness-110">
                Entrar
              </a>
            : <span className="text-[10px] text-slate-500">🔒 sala abre em 5 min</span>
        )}
        {ended && <span className="text-xs text-slate-600">Encerrada</span>}
      </div>
    </div>
  )
}

// Etapa de conclusão do perfil
function ProfileStep({ done, label, sub, href }: {
  done: boolean; label: string; sub: string; href?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={[
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all",
        done
          ? "bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-950"
          : "border border-white/15 bg-slate-800 text-slate-500",
      ].join(" ")}>
        {done ? "✓" : "·"}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${done ? "text-slate-400 line-through decoration-slate-600" : "text-slate-200"}`}>
          {label}
        </p>
        {!done && <p className="text-xs text-slate-600">{sub}</p>}
      </div>
      {!done && href && (
        <Link href={href}
          className="shrink-0 rounded-lg border border-white/10 px-3 py-1 text-xs text-slate-400 hover:border-white/20 hover:text-white transition-colors">
          Fazer
        </Link>
      )}
    </div>
  )
}

// Stat animado
function Stat({ label, target, color }: { label: string; target: number; color: string }) {
  const n = useCounter(target)
  return (
    <div className="card flex flex-col gap-1 p-4">
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{n}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  )
}

// Próxima sessão (não hoje)
function NextCard({ appt }: { appt: Appointment }) {
  const countdown = useCountdown(appt.scheduled_at)
  const ini = initials(appt.patient_full_name)
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-gradient-to-b from-emerald-400 to-cyan-500" />
      <div className="pl-4 flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 text-sm font-bold text-slate-950">
          {ini}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs uppercase tracking-widest text-slate-500">Próxima sessão</p>
            {countdown && (
              <span className="pill text-xs font-mono bg-emerald-500/15 text-emerald-300">⌛ {countdown}</span>
            )}
          </div>
          <p className="mt-0.5 text-base font-semibold text-slate-100 capitalize">{fmtShort(appt.scheduled_at)}</p>
          <p className="text-xs text-slate-500">{appt.patient_full_name ?? "Paciente"} · {fmtBRL(appt.price)}</p>
        </div>
        {appt.status === "paid" && appt.daily_room_url && (
          isWithin5Min(appt.scheduled_at)
            ? <a href={appt.daily_room_url} target="_blank" rel="noopener noreferrer"
                className="shrink-0 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110">
                Iniciar
              </a>
            : <span className="shrink-0 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-500">
                🔒 5 min antes
              </span>
        )}
      </div>
    </div>
  )
}

// Gráfico de receita
function RevenueChart({ appointments }: { appointments: Appointment[] }) {
  const now = new Date()
  const weeks = [0, 0, 0, 0]
  appointments.filter((a) => a.status === "paid").forEach((a) => {
    const d = new Date(a.scheduled_at)
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear())
      weeks[Math.min(Math.floor((d.getDate() - 1) / 7), 3)] += parseFloat(a.price)
  })
  const maxVal = Math.max(...weeks, 1)
  const totalMonth = weeks.reduce((s, v) => s + v, 0)
  if (totalMonth === 0) return null

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Receita — {now.toLocaleString("pt-BR", { month: "long" })}
        </p>
        <p className="text-sm font-semibold text-emerald-300">
          {totalMonth.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </p>
      </div>
      <div className="flex items-end gap-3" style={{ height: "72px" }}>
        {weeks.map((v, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="relative w-full flex items-end" style={{ height: "56px" }}>
              <div className="w-full rounded-t-md bg-gradient-to-t from-emerald-600/60 to-emerald-400/80 transition-all duration-700"
                style={{ height: `${Math.max((v / maxVal) * 100, v > 0 ? 8 : 0)}%` }} />
            </div>
            <p className="text-[10px] text-slate-600">S{i + 1}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// Linha de histórico
function HistoryRow({ appt }: { appt: Appointment }) {
  return (
    <div className="glass flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className={`h-2 w-2 shrink-0 rounded-full ${
          appt.status === "paid" ? "bg-emerald-400" : appt.status === "cancelled" ? "bg-red-400" : "bg-amber-400"
        }`} />
        <div>
          <p className="text-sm text-slate-200 capitalize">{fmtShort(appt.scheduled_at)}</p>
          <p className="text-xs text-slate-500">
            {appt.status === "paid" ? "Realizada" : appt.status === "cancelled" ? "Cancelada" : "Pendente"} ·{" "}
            {fmtBRL(appt.price)}
            {appt.patient_full_name && <> · {appt.patient_full_name}</>}
          </p>
        </div>
      </div>
    </div>
  )
}

// Modal de lembretes (post-its)
const STICKY_COLORS = [
  { bg: "bg-amber-200",  tab: "bg-amber-300",  text: "text-slate-800" },
  { bg: "bg-lime-200",   tab: "bg-lime-300",    text: "text-slate-800" },
  { bg: "bg-sky-200",    tab: "bg-sky-300",     text: "text-slate-800" },
  { bg: "bg-rose-200",   tab: "bg-rose-300",    text: "text-slate-800" },
  { bg: "bg-violet-200", tab: "bg-violet-300",  text: "text-slate-800" },
]

function NotesModal({ onClose }: { onClose: () => void }) {
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [newColor, setNewColor] = useState(0)
  const [noteColors, setNoteColors] = useState<Record<string, number>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch(`${API}/psychologists/me/notes`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: NoteItem[]) => {
        setNotes(data)
        const colors: Record<string, number> = {}
        data.forEach((n) => {
          const stored = localStorage.getItem(`nc:${n.id}`)
          if (stored !== null) colors[n.id] = parseInt(stored) % STICKY_COLORS.length
        })
        setNoteColors(colors)
      })
      .catch(() => {})
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  function pickColor(noteId: string, idx: number) {
    setNoteColors((prev) => ({ ...prev, [noteId]: idx }))
    localStorage.setItem(`nc:${noteId}`, String(idx))
  }

  async function add() {
    const trimmed = text.trim()
    if (!trimmed) return
    setAddError(null)
    setSaving(true)
    try {
      const res = await fetch(`${API}/psychologists/me/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ content: trimmed }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).detail ?? `Erro ${res.status}`)
      }
      const note: NoteItem = await res.json()
      // salvar cor escolhida
      setNoteColors((prev) => ({ ...prev, [note.id]: newColor }))
      localStorage.setItem(`nc:${note.id}`, String(newColor))
      setNotes((prev) => [note, ...prev])
      setText("")
      inputRef.current?.focus()
    } catch (e: any) {
      setAddError(e.message ?? "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    localStorage.removeItem(`nc:${id}`)
    await fetch(`${API}/psychologists/me/notes/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    })
  }

  function startEdit(n: NoteItem) {
    setEditingId(n.id)
    setEditText(n.content)
  }

  async function saveEdit(id: string) {
    const trimmed = editText.trim()
    if (!trimmed) return
    const res = await fetch(`${API}/psychologists/me/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content: trimmed }),
    })
    if (res.ok) {
      const updated: NoteItem = await res.json()
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)))
    }
    setEditingId(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* backdrop */}
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />

      {/* painel */}
      <div className="relative flex h-full w-full max-w-lg flex-col bg-slate-950 shadow-2xl shadow-black/60 overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">📝</span>
            <h2 className="text-base font-semibold text-slate-100">Lembretes</h2>
            {notes.length > 0 && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                {notes.length}
              </span>
            )}
          </div>
          <button onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/8 hover:text-white">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* input */}
        <div className="border-b border-white/8 p-4 space-y-2">
          {/* seletor de cor para novo post-it */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Cor do post-it:</span>
            {STICKY_COLORS.map((c, idx) => (
              <button
                key={idx}
                onClick={() => setNewColor(idx)}
                className={[
                  "h-5 w-5 rounded-full transition hover:scale-110",
                  c.tab,
                  newColor === idx ? "ring-2 ring-white ring-offset-1 ring-offset-slate-950 scale-110" : "",
                ].join(" ")}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              rows={3}
              className="flex-1 resize-none rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-50 outline-none focus:border-amber-400/50 placeholder:text-slate-600"
              placeholder="Escreva um lembrete… (Ctrl+Enter para salvar)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) add() }}
              maxLength={500}
            />
            <button
              onClick={add}
              disabled={saving || !text.trim()}
              className="self-end rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-40"
            >
              {saving ? "…" : "+ Adicionar"}
            </button>
          </div>
          {addError && (
            <p className="text-xs text-red-400">{addError}</p>
          )}
        </div>

        {/* post-its */}
        <div className="flex-1 overflow-y-auto p-4">
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-5xl">🗒️</span>
              <p className="mt-4 text-sm font-medium text-slate-400">Nenhum lembrete ainda</p>
              <p className="mt-1 text-xs text-slate-600">Escreva algo acima e clique em + Adicionar</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {notes.map((n) => {
                const colorIdx = noteColors[n.id] ?? 0
                const c = STICKY_COLORS[colorIdx]
                return (
                  <div key={n.id}
                    className={`group relative flex flex-col rounded-2xl shadow-lg ${c.bg} overflow-hidden`}
                    style={{ minHeight: "120px" }}
                  >
                    {/* tab */}
                    <div className={`h-2 w-full ${c.tab}`} />
                    <div className="flex flex-1 flex-col p-3">
                      {editingId === n.id ? (
                        /* ── modo edição ── */
                        <>
                          <textarea
                            autoFocus
                            rows={4}
                            className={`w-full flex-1 resize-none rounded-lg bg-black/10 px-2 py-1 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-slate-600 ${c.text}`}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveEdit(n.id)
                              if (e.key === "Escape") setEditingId(null)
                            }}
                            maxLength={500}
                          />
                          <div className="mt-2 flex gap-1.5">
                            <button
                              onClick={() => saveEdit(n.id)}
                              className="rounded-md bg-slate-800/60 px-2 py-0.5 text-[10px] font-semibold text-slate-200 hover:bg-slate-700"
                            >
                              Salvar
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded-md px-2 py-0.5 text-[10px] text-slate-500 hover:text-slate-700"
                            >
                              Cancelar
                            </button>
                          </div>
                        </>
                      ) : (
                        /* ── modo visualização ── */
                        <>
                          <div className="max-h-36 overflow-y-auto overflow-x-hidden">
                            <p className={`break-words whitespace-pre-wrap text-sm leading-relaxed ${c.text}`}>
                              {n.content}
                            </p>
                          </div>
                          {/* linha inferior: troca de cor + data */}
                          <div className="mt-2 flex items-center justify-between gap-1">
                            <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              {STICKY_COLORS.map((sc, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => pickColor(n.id, idx)}
                                  className={[
                                    "h-3.5 w-3.5 rounded-full transition hover:scale-125",
                                    sc.tab,
                                    colorIdx === idx ? "ring-1 ring-slate-700 scale-110" : "",
                                  ].join(" ")}
                                />
                              ))}
                            </div>
                            <p className="shrink-0 text-[10px] text-slate-500">
                              {new Date(n.created_at).toLocaleString("pt-BR", {
                                timeZone: "America/Sao_Paulo",
                                day: "2-digit", month: "short",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    {/* botões deletar + editar (visíveis no hover, escondidos no modo edição) */}
                    {editingId !== n.id && (
                      <>
                        <button
                          onClick={() => startEdit(n)}
                          title="Editar"
                          className="absolute right-9 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-black/10 text-slate-600 opacity-0 transition hover:bg-slate-600 hover:text-white group-hover:opacity-100"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => remove(n.id)}
                          title="Remover"
                          className="absolute right-2 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-black/10 text-slate-600 opacity-0 transition hover:bg-red-500 hover:text-white group-hover:opacity-100"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PsychologistDashboard() {
  const { user, loading } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [items, setItems] = useState<Appointment[]>([])
  const [fetching, setFetching] = useState(true)
  const [showNotes, setShowNotes] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user) { router.push("/login?redirect=/dashboard/psicologa"); return }
    if (user.role !== "psychologist") { router.push("/dashboard/paciente"); return }
    ;(async () => {
      try {
        const h = authHeaders()
        const [profRes, apptRes, meRes] = await Promise.all([
          fetch(`${API}/psychologists/me/profile`, { headers: h }),
          fetch(`${API}/appointments/me/psychologist`, { headers: h }),
          fetch(`${API}/auth/me`, { headers: h }),
        ])
        if (profRes.status === 401 || apptRes.status === 401) { router.push("/login?redirect=/dashboard/psicologa"); return }
        if (profRes.ok) { const d = await profRes.json(); setProfile(d.profile ?? d) }
        if (!apptRes.ok) throw new Error("Erro ao carregar agenda")
        setItems(await apptRes.json())
        if (meRes.ok) { const me = await meRes.json(); setAvatarUrl(me.avatar_url ?? null) }
      } catch (e: any) {
        toast(e.message, "error")
      } finally {
        setFetching(false)
      }
    })()
  }, [user, loading, router])

  const upcoming = useMemo(
    () => items.filter((a) => a.status !== "cancelled" && isUpcoming(a.scheduled_at))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [items]
  )
  const past = useMemo(
    () => items.filter((a) => !isUpcoming(a.scheduled_at) || a.status === "cancelled")
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()),
    [items]
  )

  const todaySessions = useMemo(() => items.filter((a) => a.status !== "cancelled" && isToday(a.scheduled_at))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()), [items])
  const nextNotToday = upcoming.find((a) => !isToday(a.scheduled_at)) ?? null
  const totalPaid = items.filter((a) => a.status === "paid").length
  const revenue = items.filter((a) => a.status === "paid").reduce((s, a) => s + parseFloat(a.price), 0)
  const pendingCount = items.filter((a) => a.status === "pending").length

  // Conclusão do perfil
  const profileSteps = useMemo(() => profile ? [
    { done: true,                    label: "Conta criada",             sub: "" },
    { done: true,                    label: "CRP registrado",           sub: "" },
    { done: !!avatarUrl,             label: "Foto de perfil",           sub: "Aumenta cliques em até 3×", href: "/dashboard/psicologa/perfil" },
    { done: !!profile.bio,           label: "Biografia preenchida",     sub: "Apresente sua abordagem", href: "/dashboard/psicologa/perfil" },
    { done: !!profile.specialties,   label: "Especialidades definidas", sub: "Melhora a busca por pacientes", href: "/dashboard/psicologa/perfil" },
    { done: profile.is_verified,     label: "CRP verificado pelo admin",sub: "Aguardando revisão da equipe" },
    { done: profile.is_accepting_patients, label: "Aceitando pacientes", sub: "Ative no seu perfil", href: "/dashboard/psicologa/perfil" },
  ] : [], [profile, avatarUrl])

  const completedSteps = profileSteps.filter((s) => s.done).length
  const totalSteps = profileSteps.length
  const profileComplete = completedSteps === totalSteps
  const pct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  const ini = initials(user?.full_name)

  if (loading || fetching) {
    return (
      <div className="grid gap-4 animate-pulse">
        {[1, 2, 3].map((n) => <div key={n} className="card h-24 bg-slate-900/50" />)}
      </div>
    )
  }

  return (
    <>
    {showNotes && <NotesModal onClose={() => setShowNotes(false)} />}
    <main className="flex flex-col gap-6">

      {/* ── Hero ── */}
      <div className="card relative overflow-hidden p-6 md:p-7">
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-emerald-500/8 blur-3xl pointer-events-none" />
        <div className="relative flex items-start gap-4">
          {/* Avatar */}
          <div className="shrink-0 h-16 w-16 rounded-2xl overflow-hidden border border-white/10 bg-slate-800 shadow-lg">
            {avatarUrl
              ? <img src={avatarUrl} alt="Foto" className="h-full w-full object-cover" />
              : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 text-xl font-bold text-slate-100">{ini}</div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs capitalize text-slate-500">{todayFmt()}</p>
            <h1 className="mt-0.5 text-xl font-semibold text-slate-50">{greeting(user?.full_name ?? "Profissional")} 👋</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              {profile?.is_verified
                ? <span className="pill bg-emerald-500/15 text-emerald-300 text-xs">✓ CRP {profile.crp}</span>
                : <span className="pill bg-amber-500/15 text-amber-300 text-xs">⏳ CRP {profile?.crp} · aguardando</span>
              }
              {profile?.is_accepting_patients
                ? <span className="pill bg-cyan-500/15 text-cyan-300 text-xs">● Visível na busca</span>
                : <span className="pill bg-slate-700/60 text-slate-400 text-xs">○ Oculta da busca</span>
              }
            </div>
          </div>
        </div>
      </div>

      {/* ── Sessões de hoje ── */}
      {todaySessions.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Hoje</h2>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              {todaySessions.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {todaySessions.map((a) => <TodayCard key={a.id} appt={a} />)}
          </div>
        </section>
      )}

      {/* ── Conclusão do perfil ── */}
      {!profileComplete && profileSteps.length > 0 && (
        <div className="card p-5">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Perfil completo
            </p>
            <p className="text-xs font-semibold text-emerald-400">{pct}%</p>
          </div>
          {/* Barra de progresso */}
          <div className="mb-4 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex flex-col gap-3">
            {profileSteps.filter((s) => !s.done).map((s) => (
              <ProfileStep key={s.label} {...s} />
            ))}
            {profileSteps.filter((s) => s.done).map((s) => (
              <ProfileStep key={s.label} {...s} />
            ))}
          </div>
        </div>
      )}

      {/* ── Ações rápidas ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <QuickAction
          href="/dashboard/psicologa/pacientes"
          accent="from-violet-500/30 to-fuchsia-500/30"
          label="Meus Pacientes"
          sub="Histórico e prontuários"
          icon={
            <svg className="h-5 w-5 text-violet-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          }
        />
        <QuickAction
          href="/dashboard/psicologa/disponibilidade"
          accent="from-emerald-500/30 to-cyan-500/30"
          label="Minha agenda"
          sub="Horários e disponibilidade"
          icon={
            <svg className="h-5 w-5 text-emerald-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          }
        />
        <QuickAction
          href="/dashboard/psicologa/perfil"
          accent="from-cyan-500/30 to-violet-500/30"
          label="Meu perfil"
          sub="Foto, bio e especialidades"
          icon={
            <svg className="h-5 w-5 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          }
        />
        <QuickAction
          href={profile ? `/psicologas/${profile.id}` : "#"}
          accent="from-violet-500/30 to-fuchsia-500/30"
          label="Meu perfil público"
          sub="Como pacientes me veem"
          icon={
            <svg className="h-5 w-5 text-violet-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          }
        />
        <div className="card flex flex-col gap-3 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/30 to-orange-500/30">
            <svg className="h-5 w-5 text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">{fmtBRL(String(revenue))}</p>
            <p className="text-xs text-slate-500">Receita total acumulada</p>
          </div>
        </div>
        <button
          onClick={() => setShowNotes(true)}
          className="group card flex flex-col gap-3 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-400/30 to-amber-500/30 shadow-sm">
            <svg className="h-5 w-5 text-yellow-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100 group-hover:text-white">Lembretes</p>
            <p className="text-xs text-slate-500">Notas e post-its</p>
          </div>
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Próximas" target={upcoming.length} color="text-cyan-300" />
        <Stat label="Realizadas" target={totalPaid}       color="text-emerald-300" />
        <Stat label="Pendentes" target={pendingCount}     color="text-amber-300" />
      </div>

      {/* ── Próxima sessão (não hoje) ── */}
      {nextNotToday && <NextCard appt={nextNotToday} />}

      {/* ── Gráfico de receita ── */}
      <RevenueChart appointments={items} />

      {/* ── Agenda futura ── */}
      {upcoming.filter((a) => !isToday(a.scheduled_at)).length > (nextNotToday ? 1 : 0) && (
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Próximas sessões
          </h2>
          <div className="relative flex flex-col">
            <div className="absolute left-[19px] top-3 bottom-3 w-px bg-gradient-to-b from-emerald-500/40 via-cyan-500/20 to-transparent" />
            {upcoming.filter((a) => !isToday(a.scheduled_at)).slice(nextNotToday ? 1 : 0).map((appt, i) => (
              <div key={appt.id} className="flex gap-4 pb-4 animate-in fade-in slide-in-from-left-2 duration-300"
                style={{ animationDelay: `${i * 60}ms` }}>
                <div className="relative mt-2 flex h-10 w-10 shrink-0 items-center justify-center">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 text-[10px] font-bold text-slate-300">
                    {initials(appt.patient_full_name)}
                  </div>
                </div>
                <div className="flex-1 glass rounded-xl px-4 py-3">
                  <p className="text-sm text-slate-200 capitalize">{fmtShort(appt.scheduled_at)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {appt.patient_full_name ?? "Paciente"} · {fmtBRL(appt.price)}
                    <span className={`ml-2 ${appt.status === "paid" ? "text-emerald-400" : "text-amber-400"}`}>
                      · {appt.status === "paid" ? "Pago" : "Pendente"}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Histórico ── */}
      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Histórico</h2>
          <div className="flex flex-col gap-2">
            {past.map((a) => <HistoryRow key={a.id} appt={a} />)}
          </div>
        </section>
      )}

      {/* ── Empty state ── */}
      {items.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-3xl">📅</p>
          <p className="mt-3 font-medium text-slate-300">Nenhum agendamento ainda</p>
          <p className="mt-1 text-sm text-slate-500">
            {profile?.is_verified
              ? "Quando um paciente reservar uma sessão, ela aparece aqui."
              : "Complete seu perfil e aguarde a verificação do CRP para aparecer na busca."}
          </p>
        </div>
      )}
    </main>
    </>
  )
}
