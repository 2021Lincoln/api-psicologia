"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/providers/auth-context"
import { useToast } from "@/components/ui/toast"
import { authHeaders } from "@/lib/auth"

const API = "/api/v1"

type Stats = {
  total_users: number
  total_patients: number
  total_psychologists: number
  psychologists_verified: number
  psychologists_pending: number
  total_appointments: number
  appointments_paid: number
  appointments_pending: number
  appointments_cancelled: number
}

type PendingPsychologist = {
  id: string
  full_name: string
  crp: string
  specialties: string | null
  hourly_rate: string
  session_duration_minutes: number
}

type Tab = "overview" | "pending"

type ConfirmAction = {
  id: string
  approved: boolean
  name: string
  crp: string
}

// ── Animated counter ──────────────────────────────────────────────────────────

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

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  const display = useCounter(value)
  return (
    <div className="card flex flex-col gap-1 p-4">
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{display}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}

// ── Confirmation modal ─────────────────────────────────────────────────────────

function ConfirmModal({
  action,
  loading,
  onConfirm,
  onCancel,
}: {
  action: ConfirmAction
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="card w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20">
          {action.approved ? (
            <span className="text-2xl">✓</span>
          ) : (
            <span className="text-2xl">✕</span>
          )}
        </div>

        <h3 className="text-base font-semibold text-slate-50">
          {action.approved ? "Aprovar psicóloga?" : "Reprovar psicóloga?"}
        </h3>
        <p className="mt-2 text-sm text-slate-400">
          {action.approved
            ? `Você está prestes a aprovar ${action.name} (CRP ${action.crp}). O perfil ficará visível na busca.`
            : `Você está prestes a reprovar ${action.name} (CRP ${action.crp}). O perfil não aparecerá na busca.`}
        </p>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-slate-400 hover:border-white/20 hover:text-slate-200 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={[
              "flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 transition-all",
              action.approved
                ? "bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 hover:brightness-110"
                : "bg-gradient-to-r from-red-500 to-red-600 text-white hover:brightness-110",
            ].join(" ")}
          >
            {loading ? "Salvando…" : action.approved ? "Sim, aprovar" : "Sim, reprovar"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { user, loading } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>("overview")
  const [stats, setStats] = useState<Stats | null>(null)
  const [pending, setPending] = useState<PendingPsychologist[]>([])
  const [fetching, setFetching] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null)

  useEffect(() => {
    if (loading) return
    if (!user) { router.push("/login?redirect=/dashboard/admin"); return }
    if (user.role !== "admin") { router.push("/"); return }
    loadAll()
  }, [user, loading])

  async function loadAll() {
    setFetching(true)
    try {
      const h = authHeaders()
      const [statsRes, pendingRes] = await Promise.all([
        fetch(`${API}/admin/stats`, { headers: h }),
        fetch(`${API}/psychologists/admin/pending`, { headers: h }),
      ])
      if (statsRes.status === 401 || pendingRes.status === 401) {
        router.push("/login?redirect=/dashboard/admin"); return
      }
      if (statsRes.ok) setStats(await statsRes.json())
      if (pendingRes.ok) setPending(await pendingRes.json())
    } catch (e: any) {
      toast(e.message, "error")
    } finally {
      setFetching(false)
    }
  }

  async function doVerify(id: string, approved: boolean) {
    setActionId(id)
    try {
      const res = await fetch(`${API}/psychologists/${id}/verify?verified=${approved}`, {
        method: "PATCH",
        headers: authHeaders(),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? "Erro ao atualizar.")
      }
      setPending((prev) => prev.filter((p) => p.id !== id))
      if (stats) {
        setStats({
          ...stats,
          psychologists_pending: stats.psychologists_pending - 1,
          psychologists_verified: approved ? stats.psychologists_verified + 1 : stats.psychologists_verified,
        })
      }
      toast(
        approved
          ? `${confirm?.name} aprovada com sucesso!`
          : `${confirm?.name} reprovada.`,
        approved ? "success" : "info"
      )
    } catch (e: any) {
      toast(e.message, "error")
    } finally {
      setActionId(null)
      setConfirm(null)
    }
  }

  if (loading || fetching) {
    return (
      <div className="grid gap-4 animate-pulse">
        {[1, 2, 3, 4].map((n) => <div key={n} className="card h-20 bg-slate-900/50" />)}
      </div>
    )
  }

  return (
    <>
      {/* ── Confirmation modal ── */}
      {confirm && (
        <ConfirmModal
          action={confirm}
          loading={actionId === confirm.id}
          onConfirm={() => doVerify(confirm.id, confirm.approved)}
          onCancel={() => setConfirm(null)}
        />
      )}

      <main className="flex flex-col gap-6">

        {/* ── Header ── */}
        <div className="card relative overflow-hidden p-6 md:p-8">
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="relative">
            <p className="text-xs uppercase tracking-widest text-slate-500">Painel administrativo</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-50">
              Olá, {user?.full_name?.split(" ")[0]} 👋
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Gerencie a plataforma e verifique os CRPs das psicólogas.
            </p>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 rounded-xl border border-white/5 bg-slate-900/40 p-1">
          {([
            { key: "overview", label: "Visão geral" },
            {
              key: "pending",
              label: `Verificações pendentes${pending.length > 0 ? ` (${pending.length})` : ""}`,
            },
          ] as { key: Tab; label: string }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all duration-200 ${
                tab === t.key
                  ? "bg-white/10 text-slate-50 shadow-sm"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {t.label}
              {t.key === "pending" && pending.length > 0 && tab !== "pending" && (
                <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-slate-950 animate-pulse">
                  {pending.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === "overview" && stats && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Usuários</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <KpiCard label="Total de usuários"       value={stats.total_users}              color="text-slate-200" />
              <KpiCard label="Pacientes"                value={stats.total_patients}           color="text-cyan-300" />
              <KpiCard label="Psicólogas cadastradas"  value={stats.total_psychologists}      color="text-violet-300" />
              <KpiCard label="Psicólogas verificadas"  value={stats.psychologists_verified}   color="text-emerald-300" />
              <div className="card flex flex-col gap-1 p-4">
                <p className={`text-2xl font-semibold tabular-nums ${
                  stats.psychologists_pending > 0 ? "text-amber-300" : "text-slate-500"
                }`}>
                  {stats.psychologists_pending}
                </p>
                <p className="text-xs text-slate-500">Aguardando verificação</p>
              </div>
            </div>

            <h2 className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Agendamentos</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="Total"      value={stats.total_appointments}      color="text-slate-200" />
              <KpiCard label="Pagos"      value={stats.appointments_paid}       color="text-emerald-300" />
              <KpiCard label="Pendentes"  value={stats.appointments_pending}    color="text-amber-300" />
              <KpiCard label="Cancelados" value={stats.appointments_cancelled}  color="text-red-300" />
            </div>
          </div>
        )}

        {/* ── Pending verification ── */}
        {tab === "pending" && (
          <div className="flex flex-col gap-3">
            {pending.length === 0 ? (
              <div className="card p-10 text-center">
                <p className="text-4xl">🎉</p>
                <p className="mt-3 text-lg text-emerald-300">Nenhuma verificação pendente</p>
                <p className="mt-1 text-sm text-slate-500">
                  Todas as psicólogas cadastradas já foram verificadas.
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  Confira o CRP em{" "}
                  <a href="https://cadastro.cfp.org.br" target="_blank" rel="noopener noreferrer"
                    className="text-cyan-300 hover:underline">
                    cadastro.cfp.org.br
                  </a>{" "}
                  antes de aprovar.
                </p>
                {pending.map((p, i) => (
                  <div
                    key={p.id}
                    className="card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between animate-in fade-in slide-in-from-bottom-2 duration-300"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Avatar with initials */}
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 text-xs font-bold text-slate-300">
                          {p.full_name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                        </div>
                        <p className="font-semibold text-slate-50">{p.full_name}</p>
                        <span className="pill bg-amber-500/15 text-amber-300 text-xs">⏳ Pendente</span>
                      </div>
                      <p className="text-sm text-slate-400">
                        CRP{" "}
                        <a
                          href={`https://cadastro.cfp.org.br/busca?crp=${encodeURIComponent(p.crp)}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-cyan-300 hover:underline"
                        >
                          {p.crp}
                        </a>
                        {p.specialties && <> · {p.specialties}</>}
                      </p>
                      <p className="text-xs text-slate-600">
                        {p.session_duration_minutes} min ·{" "}
                        {parseFloat(p.hourly_rate).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/h
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirm({ id: p.id, approved: false, name: p.full_name, crp: p.crp })}
                        disabled={actionId === p.id}
                        className="rounded-xl border border-red-500/30 px-4 py-2 text-sm text-red-300 hover:border-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                      >
                        Reprovar
                      </button>
                      <button
                        onClick={() => setConfirm({ id: p.id, approved: true, name: p.full_name, crp: p.crp })}
                        disabled={actionId === p.id}
                        className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50 transition-all"
                      >
                        Aprovar
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </main>
    </>
  )
}
