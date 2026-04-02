"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { useAuth } from "@/providers/auth-context"
import { useToast } from "@/components/ui/toast"
import { authHeaders } from "@/lib/auth"

type Patient = {
  patient_id: string
  full_name: string
  email: string
  avatar_url?: string | null
  session_count: number
  last_session_at?: string | null
}

const API = "/api/v1"

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export default function PacientesPage() {
  const { user, loading } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [fetching, setFetching] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (loading) return
    if (!user) { router.push("/login?redirect=/dashboard/psicologa/pacientes"); return }
    if (user.role !== "psychologist") { router.push("/dashboard/paciente"); return }
    ;(async () => {
      try {
        const res = await fetch(`${API}/psychologists/me/patients`, { headers: authHeaders() })
        if (res.status === 401) { router.push("/login?redirect=/dashboard/psicologa/pacientes"); return }
        if (!res.ok) throw new Error("Erro ao carregar pacientes")
        setPatients(await res.json())
      } catch (e: any) {
        toast(e.message, "error")
      } finally {
        setFetching(false)
      }
    })()
  }, [user, loading, router])

  const filtered = patients.filter(
    (p) =>
      search === "" ||
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
  )

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
          <h1 className="text-xl font-bold text-slate-50">Meus Pacientes</h1>
          <p className="text-sm text-slate-500">
            {patients.length} paciente{patients.length !== 1 ? "s" : ""} atendido{patients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/dashboard/psicologa"
          className="text-xs text-slate-500 transition hover:text-cyan-300"
        >
          ← Voltar ao dashboard
        </Link>
      </div>

      {/* ── Busca ── */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          placeholder="Buscar por nome ou e-mail…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-slate-900/70 py-2.5 pl-9 pr-4 text-sm text-slate-50 outline-none focus:border-cyan-400 placeholder:text-slate-600"
        />
      </div>

      {/* ── Lista ── */}
      {filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-3xl">👥</p>
          <p className="mt-3 font-medium text-slate-300">
            {search ? "Nenhum paciente encontrado" : "Nenhum paciente ainda"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {search
              ? "Tente outra busca."
              : "Quando atender um paciente, ele aparecerá aqui com histórico completo."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((p) => (
            <Link
              key={p.patient_id}
              href={`/dashboard/psicologa/pacientes/${p.patient_id}`}
              className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              {/* Avatar */}
              <div className="shrink-0 h-12 w-12 rounded-full overflow-hidden border border-white/10">
                {p.avatar_url
                  ? <img src={p.avatar_url} alt={p.full_name} className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500/30 to-violet-500/30 text-sm font-bold text-slate-100">
                      {initials(p.full_name)}
                    </div>
                }
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-100">{p.full_name}</p>
                <p className="text-xs text-slate-500 truncate">{p.email}</p>
              </div>

              {/* Stats */}
              <div className="shrink-0 text-right hidden sm:block">
                <p className="text-sm font-semibold text-cyan-300">{p.session_count}</p>
                <p className="text-[10px] text-slate-500">sessões</p>
              </div>
              {p.last_session_at && (
                <div className="shrink-0 text-right hidden md:block">
                  <p className="text-xs text-slate-400">{fmtDate(p.last_session_at)}</p>
                  <p className="text-[10px] text-slate-600">última sessão</p>
                </div>
              )}

              {/* Chevron */}
              <svg className="shrink-0 h-4 w-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m9 18 6-6-6-6"/>
              </svg>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
