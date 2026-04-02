"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

const API = "/api/v1"

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [token, setToken] = useState(searchParams.get("token") ?? "")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError("A senha deve ter pelo menos 8 caracteres."); return }
    if (password !== confirm) { setError("As senhas não coincidem."); return }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), new_password: password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? "Token inválido ou expirado.")
      setDone(true)
      setTimeout(() => router.push("/login"), 2500)
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
          <h1 className="text-2xl font-bold text-slate-50">Nova senha</h1>
          <p className="mt-1 text-sm text-slate-400">
            Escolha uma senha forte para sua conta.
          </p>
        </div>

        <div className="card p-7">
          {!done ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {!searchParams.get("token") && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Token de redefinição</label>
                  <input
                    type="text"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-50 outline-none transition focus:border-cyan-400 font-mono"
                    placeholder="Cole o token recebido por e-mail"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">Nova senha (mín. 8 caracteres)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-50 outline-none transition focus:border-cyan-400"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">Confirmar nova senha</label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={[
                    "rounded-xl border bg-slate-900/70 px-3 py-2.5 text-sm text-slate-50 outline-none transition",
                    confirm && confirm !== password
                      ? "border-red-500/50 focus:border-red-400"
                      : "border-white/10 focus:border-cyan-400",
                  ].join(" ")}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                {confirm && confirm !== password && (
                  <p className="text-xs text-red-400">As senhas não coincidem.</p>
                )}
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
                disabled={loading || (!!confirm && confirm !== password)}
                className="rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-60"
              >
                {loading ? "Salvando…" : "Salvar nova senha"}
              </button>
            </form>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6 text-emerald-400">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="font-semibold text-slate-50">Senha redefinida!</p>
              <p className="text-sm text-slate-400">Redirecionando para o login…</p>
            </div>
          )}

          <p className="mt-5 text-center text-sm text-slate-500">
            <Link href="/login" className="text-cyan-300 transition hover:text-cyan-200 hover:underline">
              ← Voltar ao login
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
