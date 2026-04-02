"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/providers/auth-context"
import { authHeaders } from "@/lib/auth"

const API = "/api/v1"

type Appointment = {
  id: string
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

export default function BookingSuccessPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session_id")

  const [appt, setAppt] = useState<Appointment | null>(null)
  const [fetching, setFetching] = useState(true)
  const [pollCount, setPollCount] = useState(0)

  // After Stripe redirects here, the webhook may still be processing.
  // Poll the user's most recent pending appointment up to 5 times (5s intervals).
  useEffect(() => {
    if (loading) return
    if (!user) {
      router.push("/login")
      return
    }

    async function findPaidAppointment() {
      try {
        const res = await fetch(`${API}/appointments/me/patient`, { headers: authHeaders() })
        if (!res.ok) return null
        const list: Appointment[] = await res.json()
        // Find the most recent paid appointment (webhook may have fired)
        const paid = list
          .filter((a) => a.status === "paid")
          .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
        return paid[0] ?? null
      } catch {
        return null
      }
    }

    let attempts = 0
    const MAX_ATTEMPTS = 6

    async function poll() {
      const found = await findPaidAppointment()
      if (found) {
        setAppt(found)
        setFetching(false)
        return
      }
      attempts++
      setPollCount(attempts)
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(poll, 1500)
      } else {
        // Webhook might be slow — show generic success anyway
        setFetching(false)
      }
    }

    poll()
  }, [user, loading, router])

  if (loading || (fetching && pollCount < 2)) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
          <p className="text-sm text-slate-400">Confirmando pagamento…</p>
        </div>
      </div>
    )
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="card p-8 text-center">
          {/* Success icon */}
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 ring-4 ring-emerald-500/20">
            <svg className="h-10 w-10 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1 className="text-2xl font-semibold text-emerald-300">Pagamento confirmado!</h1>
          <p className="mt-2 text-sm text-slate-400">
            Sua consulta está agendada e o pagamento foi processado com sucesso.
          </p>

          {appt && (
            <div className="mt-5 rounded-xl border border-white/10 bg-slate-900/50 p-4 text-left">
              <p className="text-xs uppercase tracking-widest text-slate-500">Detalhes da consulta</p>
              <p className="mt-2 text-base font-medium capitalize text-slate-100">
                {fmtDate(appt.scheduled_at)}
              </p>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-slate-400">{appt.duration_minutes} minutos</span>
                <span className="font-semibold text-emerald-300">{fmtBRL(appt.price)}</span>
              </div>
              <div className="mt-3 rounded-lg bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300">
                🔒 O link da videochamada fica disponível 5 minutos antes da sessão no seu dashboard.
              </div>
            </div>
          )}

          {!appt && (
            <div className="mt-5 rounded-xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-400">
              <p>Seu pagamento foi recebido pelo Stripe.</p>
              <p className="mt-1 text-xs text-slate-500">
                A confirmação pode levar alguns segundos. Verifique seu dashboard.
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/dashboard/paciente"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:brightness-110 transition-all"
            >
              Ver meus agendamentos
            </Link>
            <Link
              href="/"
              className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              Voltar à página inicial
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
