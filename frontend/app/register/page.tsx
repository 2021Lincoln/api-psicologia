"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { useAuth } from "@/providers/auth-context"
import { authHeaders } from "@/lib/auth"

const API = "/api/v1"

const CRP_REGEX = /^([A-Z]{2}|\d{2})\/\d{4,6}$/i

function validateCRP(crp: string): string | null {
  const clean = crp.trim()
  if (!clean) return "CRP é obrigatório."
  if (!CRP_REGEX.test(clean)) return "Formato inválido. Use XX/XXXXX (ex: 06/12345 ou SP/12345)."
  return null
}

type Step1 = {
  full_name: string
  email: string
  password: string
  phone: string
  role: "patient" | "psychologist"
  sex: "male" | "female" | "other" | ""
}

type Step2 = {
  crp: string
  bio: string
  specialties: string
  hourly_rate: string
  session_duration_minutes: string
}

const ROLE_CARDS = [
  {
    value: "patient" as const,
    label: "Paciente",
    desc: "Quero encontrar um profissional e agendar consultas",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    value: "psychologist" as const,
    label: "Psicóloga",
    desc: "Sou psicóloga e quero oferecer consultas pela plataforma",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
]

export default function RegisterPage() {
  const { login } = useAuth()
  const router = useRouter()

  const [step, setStep] = useState<1 | 2>(1)
  const [step1, setStep1] = useState<Step1>({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    role: "patient",
    sex: "",
  })
  const [step2, setStep2] = useState<Step2>({
    crp: "",
    bio: "",
    specialties: "",
    hourly_rate: "",
    session_duration_minutes: "50",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault()
    if (step1.role === "patient") {
      await submitAll()
    } else {
      setError(null)
      setStep(2)
    }
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault()
    const crpError = validateCRP(step2.crp)
    if (crpError) { setError(crpError); return }
    await submitAll()
  }

  async function submitAll() {
    setError(null)
    setLoading(true)
    try {
      const regRes = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: step1.full_name,
          email: step1.email,
          password: step1.password,
          phone: step1.phone || null,
          role: step1.role,
          sex: step1.sex || null,
        }),
      })
      if (!regRes.ok) {
        const err = await regRes.json().catch(() => ({}))
        throw new Error(err.detail ?? "Erro ao criar conta.")
      }

      await login(step1.email, step1.password)

      if (step1.role === "psychologist") {
        const profRes = await fetch(`${API}/psychologists/me/profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            crp: step2.crp,
            bio: step2.bio || null,
            specialties: step2.specialties || null,
            hourly_rate: parseFloat(step2.hourly_rate),
            session_duration_minutes: parseInt(step2.session_duration_minutes),
            is_accepting_patients: true,
          }),
        })
        if (!profRes.ok) {
          const err = await profRes.json().catch(() => ({}))
          throw new Error(err.detail ?? "Erro ao criar perfil profissional.")
        }
        router.push("/dashboard/psicologa")
      } else {
        router.push("/dashboard/paciente")
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isPsychologist = step1.role === "psychologist"

  return (
    <main className="flex min-h-[80vh] items-center justify-center py-8">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-50">
            {step === 1 ? "Criar conta grátis" : "Perfil profissional"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {step === 1
              ? "Comece sua jornada de saúde mental hoje"
              : "Preencha suas informações profissionais para aparecer na busca"}
          </p>
        </div>

        {/* Progress bar — visible when psychologist reached step 2 */}
        {isPsychologist && (
          <div className="mb-6 flex items-center gap-3">
            <div className="flex-1">
              <div className="mb-1 flex justify-between text-[10px] font-medium text-slate-500">
                <span className={step >= 1 ? "text-cyan-400" : ""}>Dados pessoais</span>
                <span className={step >= 2 ? "text-cyan-400" : ""}>Perfil profissional</span>
              </div>
              <div className="flex gap-1.5">
                <div className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 1 ? "bg-gradient-to-r from-cyan-500 to-cyan-400" : "bg-white/10"}`} />
                <div className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 2 ? "bg-gradient-to-r from-violet-500 to-violet-400" : "bg-white/10"}`} />
              </div>
            </div>
          </div>
        )}

        <div className="card p-7">
          {step === 1 && (
            <form onSubmit={handleStep1} className="flex flex-col gap-4">

              {/* Role selection */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-slate-400">Tipo de conta</label>
                <div className="grid grid-cols-2 gap-3">
                  {ROLE_CARDS.map(({ value, label, desc, icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStep1({ ...step1, role: value })}
                      className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition ${
                        step1.role === value
                          ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-200"
                          : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-slate-300"
                      }`}
                    >
                      <span className={step1.role === value ? "text-cyan-300" : ""}>{icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-50">{label}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">Nome completo</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={step1.full_name}
                  onChange={(e) => setStep1({ ...step1, full_name: e.target.value })}
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-50 outline-none transition focus:border-cyan-400"
                  placeholder="Seu nome completo"
                  autoComplete="name"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">E-mail</label>
                <input
                  type="email"
                  required
                  value={step1.email}
                  onChange={(e) => setStep1({ ...step1, email: e.target.value })}
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-50 outline-none transition focus:border-cyan-400"
                  placeholder="seu@email.com"
                  autoComplete="email"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">Senha (mín. 8 caracteres)</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={step1.password}
                    onChange={(e) => setStep1({ ...step1, password: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 pr-10 text-sm text-slate-50 outline-none transition focus:border-cyan-400"
                    placeholder="••••••••"
                    autoComplete="new-password"
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

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Telefone (opcional)</label>
                  <input
                    type="tel"
                    value={step1.phone}
                    onChange={(e) => setStep1({ ...step1, phone: e.target.value })}
                    className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-50 outline-none transition focus:border-cyan-400"
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Sexo (opcional)</label>
                  <select
                    value={step1.sex}
                    onChange={(e) => setStep1({ ...step1, sex: e.target.value as Step1["sex"] })}
                    className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-50 outline-none transition focus:border-cyan-400"
                  >
                    <option value="">Prefiro não dizer</option>
                    <option value="female">Feminino</option>
                    <option value="male">Masculino</option>
                    <option value="other">Outro</option>
                  </select>
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
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-60"
              >
                {loading ? "Aguarde..." : isPsychologist ? (
                  <>Próximo <span className="text-base">→</span></>
                ) : "Criar conta"}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleStep2} className="flex flex-col gap-4">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                Complete seu perfil para aparecer na busca de pacientes.
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">Número do CRP</label>
                <input
                  type="text"
                  required
                  minLength={4}
                  value={step2.crp}
                  onChange={(e) => setStep2({ ...step2, crp: e.target.value })}
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-50 outline-none transition focus:border-cyan-400"
                  placeholder="06/12345"
                />
                <p className="text-[11px] text-slate-600">Formato: UF/número (ex: 06/12345 ou SP/12345)</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">Bio (opcional)</label>
                <textarea
                  rows={3}
                  value={step2.bio}
                  onChange={(e) => setStep2({ ...step2, bio: e.target.value })}
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-50 outline-none transition focus:border-cyan-400 resize-none"
                  placeholder="Fale um pouco sobre sua abordagem e experiência..."
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">Especialidades (opcional)</label>
                <input
                  type="text"
                  value={step2.specialties}
                  onChange={(e) => setStep2({ ...step2, specialties: e.target.value })}
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-50 outline-none transition focus:border-cyan-400"
                  placeholder="TCC, Ansiedade, Depressão, Relacionamentos"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Valor/hora (R$)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={0.01}
                    value={step2.hourly_rate}
                    onChange={(e) => setStep2({ ...step2, hourly_rate: e.target.value })}
                    className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-50 outline-none transition focus:border-cyan-400"
                    placeholder="150.00"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Duração (min)</label>
                  <select
                    value={step2.session_duration_minutes}
                    onChange={(e) => setStep2({ ...step2, session_duration_minutes: e.target.value })}
                    className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-50 outline-none transition focus:border-cyan-400"
                  >
                    {[30, 45, 50, 60, 90, 120].map((m) => (
                      <option key={m} value={m}>{m} min</option>
                    ))}
                  </select>
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

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setStep(1); setError(null) }}
                  className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-slate-300 transition hover:border-white/20 hover:text-slate-100"
                >
                  ← Voltar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-60"
                >
                  {loading ? "Criando conta..." : "Criar conta"}
                </button>
              </div>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">
            Já tem conta?{" "}
            <Link href="/login" className="text-cyan-300 transition hover:text-cyan-200 hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
