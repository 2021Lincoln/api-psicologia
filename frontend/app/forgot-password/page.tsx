"use client"

import { useState } from "react"
import Link from "next/link"

const API = "/api/v1"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [devToken, setDevToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? "Erro ao processar solicitação.")
      setDone(true)
      if (data.dev_token) setDevToken(data.dev_token)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-600 shadow-lg shadow-cyan-500/25">
            <span className="select-none text-[24px] font-bold leading-none text-slate-950">Ψ</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-50">Esqueceu a senha?</h1>
          <p className="mt-1 text-sm text-slate-400">
            Informe seu e-mail para receber as instruções de redefinição.
          </p>
        </div>

        <div className="card p-7">
          {!done ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">E-mail cadastrado</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-50 outline-none transition focus:border-cyan-400"
                  placeholder="seu@email.com"
                  autoComplete="email"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0 text-red-400">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-60"
              >
                {loading ? "Enviando…" : "Enviar instruções"}
              </button>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6 text-emerald-400">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="font-semibold text-slate-50">Instruções enviadas!</p>
                <p className="text-sm text-slate-400">
                  Se o e-mail estiver cadastrado, você receberá as instruções em breve.
                </p>
              </div>

              {devToken && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-400">
                    Modo de desenvolvimento
                  </p>
                  <p className="mb-3 text-xs text-slate-400">
                    Sem e-mail configurado. Use o token abaixo para redefinir sua senha:
                  </p>
                  <code className="block break-all rounded-lg bg-slate-950/50 px-3 py-2 text-xs text-amber-300">
                    {devToken}
                  </code>
                  <Link
                    href={`/reset-password?token=${devToken}`}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2 text-xs font-semibold text-slate-950 transition hover:brightness-110"
                  >
                    Redefinir senha com este token →
                  </Link>
                </div>
              )}
            </div>
          )}

          <p className="mt-5 text-center text-sm text-slate-500">
            Lembrou a senha?{" "}
            <Link href="/login" className="text-cyan-300 transition hover:text-cyan-200 hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
