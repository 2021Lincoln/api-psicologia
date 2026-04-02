"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

import { useAuth } from "@/providers/auth-context"

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect") ?? ""

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const me = await login(email, password)
      if (redirect) {
        router.push(redirect)
      } else if (me.role === "psychologist") {
        router.push("/dashboard/psicologa")
      } else if (me.role === "admin") {
        router.push("/dashboard/admin")
      } else {
        router.push("/dashboard/paciente")
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-[80vh] items-center justify-center py-8">
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-white/5 shadow-2xl shadow-black/50 md:flex">

        {/* Left panel — branding + social proof */}
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-cyan-50 via-blue-50 to-violet-100 p-10 md:flex md:w-[45%] border-r border-slate-200">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-cyan-500/20 blur-3xl" />
            <div className="absolute -bottom-16 -right-8 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
          </div>

          {/* Logo */}
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-600 shadow-lg shadow-cyan-500/25">
              <span className="select-none text-[20px] font-bold leading-none text-slate-950">Ψ</span>
            </div>
            <div>
              <p className="text-[15px] font-bold text-slate-50">
                Psico<span className="bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">Connect</span>
              </p>
              <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Marketplace de Psicologia</p>
            </div>
          </div>

          {/* Quote */}
          <div className="relative space-y-5">
            <div className="text-4xl text-cyan-400/40 font-serif leading-none select-none">"</div>
            <blockquote className="text-base text-slate-200 italic leading-relaxed">
              A terapia me deu ferramentas que uso todos os dias. Aprendi a entender
              minhas emoções e a agir com mais clareza.
            </blockquote>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-violet-500/30 text-sm font-bold text-slate-200">
                M
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">Mariana S.</p>
                <p className="text-xs text-slate-500">Paciente · São Paulo, SP</p>
              </div>
            </div>
          </div>

          {/* Trust items */}
          <div className="relative space-y-2.5">
            {[
              "Profissionais verificados com CRP",
              "Pagamento seguro online",
              "Vídeo criptografado",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5 text-sm text-slate-400">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
                  ✓
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Right panel — form */}
        <div className="flex flex-1 flex-col justify-center bg-white px-8 py-10 md:px-10">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="mb-1 text-2xl font-bold text-slate-50">Bem-vindo de volta</h1>
            <p className="mb-7 text-sm text-slate-400">
              Acesse sua conta para continuar sua jornada.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">E-mail</label>
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

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-400">Senha</label>
                  <Link href="/forgot-password" className="text-xs text-slate-500 transition hover:text-cyan-300">
                    Esqueci minha senha
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 pr-10 text-sm text-slate-50 outline-none transition focus:border-cyan-400"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0 text-red-400">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-60"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Não tem conta?{" "}
              <Link href="/register" className="text-cyan-300 transition hover:text-cyan-200 hover:underline">
                Cadastre-se grátis
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
