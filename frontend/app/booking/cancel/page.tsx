"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"

export default function BookingCancelPage() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="card p-8 text-center">
          {/* Cancel icon */}
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/15 ring-4 ring-amber-500/20">
            <svg className="h-10 w-10 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h1 className="text-xl font-semibold text-amber-300">Pagamento não realizado</h1>
          <p className="mt-2 text-sm text-slate-400">
            Você saiu do checkout antes de concluir o pagamento. Seu agendamento ainda está reservado e aguardando pagamento.
          </p>

          <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200/80">
            ⏳ O agendamento fica pendente por 30 minutos. Após esse prazo, o horário pode ser liberado para outros pacientes.
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/dashboard/paciente"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:brightness-110 transition-all"
            >
              Tentar pagar novamente
            </Link>
            <Link
              href="/"
              className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              Buscar outra psicóloga
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
