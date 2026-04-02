"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"

import { useAuth } from "@/providers/auth-context"
import { authHeaders } from "@/lib/auth"

const API = "/api/v1"

type Appointment = {
  id: string
  psychologist_profile_id: string
  scheduled_at: string
  status: "pending" | "paid" | "cancelled"
  price: string
  duration_minutes: number
  daily_room_url?: string | null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtBRL(v: string) {
  return parseFloat(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function useCanEnter(iso: string | undefined) {
  const check = () => iso ? new Date(iso).getTime() - Date.now() <= 5 * 60_000 : false
  const [ok, setOk] = useState(check)
  useEffect(() => {
    setOk(check())
    const id = setInterval(() => setOk(check()), 15_000)
    return () => clearInterval(id)
  }, [iso])
  return ok
}

export default function CheckoutPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [appt, setAppt] = useState<Appointment | null>(null)
  const [fetching, setFetching] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canEnter = useCanEnter(appt?.scheduled_at)

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.push(`/login?redirect=/checkout/${id}`)
      return
    }
    ;(async () => {
      try {
        const res = await fetch(`${API}/appointments/${id}`, { headers: authHeaders() })
        if (res.status === 401) { router.push(`/login?redirect=/checkout/${id}`); return }
        if (!res.ok) throw new Error("Agendamento não encontrado.")
        setAppt(await res.json())
      } catch (e: any) {
        setError(e.message)
      } finally {
        setFetching(false)
      }
    })()
  }, [user, loading, id, router])

  async function pay() {
    if (!appt || !user) return
    setPaying(true)
    setError(null)
    try {
      const res = await fetch(`${API}/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          appointment_id: appt.id,
          customer_email: user.email,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? "Erro ao iniciar pagamento.")
      }
      const data = await res.json()
      window.location.href = data.checkout_url
    } catch (e: any) {
      setError(e.message)
      setPaying(false)
    }
  }

  async function mockPay() {
    if (!appt) return
    setPaying(true)
    setError(null)
    try {
      const res = await fetch(`${API}/payments/mock-pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ appointment_id: appt.id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? "Erro ao simular pagamento.")
      }
      const data = await res.json()
      setAppt({ ...appt, status: "paid", daily_room_url: data.daily_room_url })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setPaying(false)
    }
  }

  if (loading || fetching) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="grid gap-4 w-full max-w-md animate-pulse">
          {[1, 2, 3].map((n) => <div key={n} className="card h-20 bg-slate-900/50" />)}
        </div>
      </div>
    )
  }

  if (error && !appt) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="card w-full max-w-md p-8 text-center">
          <p className="text-red-300">{error}</p>
          <Link href="/dashboard/paciente" className="mt-4 inline-block text-sm text-cyan-300 hover:underline">
            Voltar ao dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (appt?.status === "paid") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
            <span className="text-3xl">✓</span>
          </div>
          <h1 className="text-xl font-semibold text-emerald-300">Pagamento confirmado!</h1>
          <p className="mt-2 text-sm text-slate-400">{fmtDate(appt.scheduled_at)}</p>
          {appt.daily_room_url && (
            canEnter
              ? <a
                  href={appt.daily_room_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-110"
                >
                  Entrar na sala de vídeo
                </a>
              : <p className="mt-4 text-sm text-slate-500">
                  🔒 Link disponível 5 min antes da sessão
                </p>
          )}
          <div className="mt-4">
            <Link href="/dashboard/paciente" className="text-sm text-slate-400 hover:text-slate-300">
              Voltar ao dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (appt?.status === "cancelled") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="card w-full max-w-md p-8 text-center">
          <p className="text-slate-300">Este agendamento foi cancelado.</p>
          <Link href="/dashboard/paciente" className="mt-4 inline-block text-sm text-cyan-300 hover:underline">
            Voltar ao dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="mb-6">
          <Link href="/dashboard/paciente" className="text-sm text-slate-500 hover:text-slate-300">
            ← Voltar ao dashboard
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-slate-50">Confirmar pagamento</h1>
          <p className="mt-1 text-sm text-slate-400">Revise os detalhes antes de pagar.</p>
        </div>

        {/* Summary card */}
        {appt && (
          <div className="card relative overflow-hidden p-6">
            <div className="absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-gradient-to-b from-cyan-400 to-violet-500" />
            <div className="pl-4 flex flex-col gap-4">

              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500">Consulta</p>
                <p className="mt-1 text-lg font-semibold capitalize text-slate-50">
                  {fmtDate(appt.scheduled_at)}
                </p>
                <p className="mt-0.5 text-sm text-slate-400">
                  Duração: {appt.duration_minutes} minutos
                </p>
              </div>

              <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">Valor da sessão</p>
                  <p className="text-xl font-semibold text-cyan-300">{fmtBRL(appt.price)}</p>
                </div>
                <p className="mt-1 text-xs text-slate-600">Pagamento seguro via Stripe</p>
              </div>

              {error && (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {error}
                </p>
              )}

              <button
                onClick={pay}
                disabled={paying}
                className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 py-3 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60"
              >
                {paying ? "Redirecionando para pagamento..." : `Pagar ${fmtBRL(appt.price)}`}
              </button>

              <p className="text-center text-xs text-slate-600">
                Você será redirecionado para o Stripe para completar o pagamento com segurança.
              </p>

              {/* Separador de modo de teste */}
              <div className="relative my-1 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/5" />
                <span className="text-[11px] text-slate-600">modo de teste</span>
                <div className="h-px flex-1 bg-white/5" />
              </div>

              <button
                onClick={mockPay}
                disabled={paying}
                className="w-full rounded-xl border border-white/10 py-3 text-sm text-slate-400 hover:border-white/20 hover:text-slate-200 disabled:opacity-60 transition-colors"
              >
                {paying ? "Processando..." : "Simular pagamento (Teste)"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
