"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/providers/auth-context"
import { SkeletonPsychologistCard } from "@/components/ui/skeleton"
import { getAccent } from "@/lib/accent-colors"

type PsychologistListItem = {
  id: string
  full_name: string
  crp: string
  specialties: string | null
  hourly_rate: string
  session_duration_minutes: number
  is_accepting_patients: boolean
  avatar_url: string | null
  avg_rating: number | null
  review_count: number
  gender: string | null
  accent_color: string | null
}

const API_BASE = "/api/v1"

const TESTIMONIALS = [
  {
    name: "Mariana S.",
    location: "São Paulo, SP",
    rating: 5,
    text: "A plataforma me conectou com uma psicóloga incrível em menos de 5 minutos. Agendar e pagar foi super simples, e a sessão por vídeo funcionou perfeitamente.",
    initials: "MS",
    color: "from-sky-500 to-blue-500",
  },
  {
    name: "Rafael M.",
    location: "Rio de Janeiro, RJ",
    rating: 5,
    text: "Nunca imaginei que seria tão fácil encontrar atendimento psicológico online. Já fiz 4 sessões e me sinto muito melhor. Recomendo demais para qualquer pessoa.",
    initials: "RM",
    color: "from-indigo-500 to-purple-500",
  },
  {
    name: "Camila T.",
    location: "Belo Horizonte, MG",
    rating: 5,
    text: "Finalmente um serviço que respeita meu tempo. Sem esperar semanas para conseguir horário. Em 2 dias já estava na minha primeira consulta e adorei.",
    initials: "CT",
    color: "from-teal-500 to-emerald-500",
  },
]

const WHY_THERAPY = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "Bem-estar emocional",
    desc: "Reduza ansiedade, estresse e sintomas depressivos com apoio profissional contínuo.",
    bg: "bg-sky-50",
    border: "border-sky-100",
    iconColor: "text-sky-600",
    iconBg: "bg-sky-100",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 3" />
      </svg>
    ),
    title: "Autoconhecimento",
    desc: "Entenda seus padrões e construa uma vida mais alinhada com seus valores e objetivos.",
    bg: "bg-indigo-50",
    border: "border-indigo-100",
    iconColor: "text-indigo-600",
    iconBg: "bg-indigo-100",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Relacionamentos",
    desc: "Melhore sua comunicação e fortaleça vínculos com quem você ama.",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-100",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: "Ferramentas práticas",
    desc: "Aprenda técnicas como TCC para lidar com desafios do dia a dia de forma concreta.",
    bg: "bg-amber-50",
    border: "border-amber-100",
    iconColor: "text-amber-600",
    iconBg: "bg-amber-100",
  },
]

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Encontre sua psicóloga",
    desc: "Filtre por especialidade, preço e disponibilidade. Veja perfil completo, bio e avaliações de pacientes reais.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
    accent: "from-sky-500 to-blue-600",
  },
  {
    step: "02",
    title: "Agende e pague online",
    desc: "Escolha o horário disponível e confirme com pagamento seguro via cartão. Sem ligações, sem burocracia.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    accent: "from-indigo-500 to-purple-500",
  },
  {
    step: "03",
    title: "Consulte por vídeo",
    desc: "Na hora marcada, entre pelo link seguro. Sessão por vídeo criptografado, de onde você estiver.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
    accent: "from-teal-500 to-emerald-500",
  },
]

export default function HomePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [specialty, setSpecialty] = useState("")
  const [minPrice, setMinPrice] = useState("")
  const [maxPrice, setMaxPrice] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<PsychologistListItem[]>([])

  useEffect(() => {
    if (authLoading) return
    if (user?.role === "psychologist") { router.replace("/dashboard/psicologa"); return }
    if (user?.role === "admin") { router.replace("/dashboard/admin"); return }
  }, [user, authLoading, router])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (specialty) params.set("specialty", specialty)
      if (minPrice) params.set("min_price", minPrice)
      if (maxPrice) params.set("max_price", maxPrice)
      params.set("limit", "20")
      const res = await fetch(`${API_BASE}/psychologists?${params.toString()}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      setItems(await res.json())
    } catch (err: any) {
      setError(err.message ?? "Erro ao buscar psicólogas")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="flex flex-col gap-20">

      {/* ── Hero ── */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-gradient-to-br from-white via-blue-50/60 to-indigo-50/40 px-8 py-14 shadow-sm md:px-14 md:py-16">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 right-8 h-56 w-56 rounded-full bg-indigo-400/10 blur-3xl" />

        <div className="relative grid gap-10 lg:grid-cols-[3fr,2fr] lg:items-center">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
              Profissionais verificados · CRP confirmado
            </span>

            <h1 className="text-4xl font-bold leading-tight text-slate-900 md:text-5xl lg:text-[3.25rem]">
              Cuide da sua<br />
              <span className="bg-gradient-to-r from-sky-600 to-indigo-600 bg-clip-text text-transparent">
                saúde mental
              </span>
              <br />
              com quem entende
            </h1>

            <p className="max-w-lg text-lg leading-relaxed text-slate-600">
              Conecte-se com psicólogas verificadas. Compare perfis, agende online e realize
              sua consulta por vídeo — sem burocracia, sem fila.
            </p>

            <div className="flex flex-wrap gap-3">
              <a
                href="#profissionais"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-400 px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:from-sky-200 hover:to-indigo-200 hover:shadow-md active:scale-[0.98]"
              >
                Encontrar psicóloga
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </a>
              {!user && (
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-400 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-sky-500 hover:to-indigo-500 hover:shadow-md"
                >
                  Cadastrar grátis
                </Link>
              )}
            </div>

            <div className="flex flex-wrap gap-8 border-t border-slate-100 pt-5">
              {[
                { num: "100%", label: "CRP verificado" },
                { num: "4.9★", label: "Avaliação média" },
                { num: "Online", label: "Sem deslocamento" },
              ].map(({ num, label }) => (
                <div key={label}>
                  <p className="text-xl font-bold text-sky-600">{num}</p>
                  <p className="text-xs text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Search box */}
          <div className="rounded-2xl border border-sky-200/60 bg-gradient-to-br from-sky-100 to-indigo-50 p-6 shadow-lg shadow-sky-200/40">
            <p className="mb-4 text-sm font-semibold text-slate-900">Refinar busca</p>
            <div className="grid gap-3">
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                placeholder="Especialidade (ex: TCC, ansiedade)"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  placeholder="Preço mín. (R$)"
                  type="number"
                  min={0}
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                />
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  placeholder="Preço máx. (R$)"
                  type="number"
                  min={0}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                />
              </div>
              <button
                onClick={load}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-400 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:from-sky-200 hover:to-indigo-200 hover:shadow-md disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {loading ? "Buscando..." : "Buscar psicólogas"}
              </button>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error} — verifique se a API ({API_BASE}) está acessível.
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Ansiedade", "Depressão", "TCC", "Autoestima"].map((tag) => (
                <button
                  key={tag}
                  onClick={() => { setSpecialty(tag); load() }}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Profissionais ── */}
      <section className="flex flex-col gap-6" id="profissionais">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Profissionais disponíveis</h2>
            <p className="text-sm text-slate-500">Todas verificadas com CRP ativo</p>
          </div>
          {!user && (
            <Link href="/register" className="text-sm font-medium text-sky-600 transition hover:text-sky-700 hover:underline">
              Criar conta grátis →
            </Link>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {loading && items.length === 0 && (
            <>
              {[1, 2, 3, 4].map((n) => (
                <SkeletonPsychologistCard key={n} delay={n * 80} />
              ))}
            </>
          )}
          {!loading && items.filter((p) => p?.id && p.id !== "undefined").map((p) => (
            <Link
              key={p.id}
              href={`/psicologas/${p.id}`}
              className="card group relative overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200"
            >
              {/* Accent color strip */}
              <div className="h-1.5 w-full" style={{ background: getAccent(p.accent_color).gradient }} />

              <div className="p-5">
              <div className="pointer-events-none absolute right-3 top-8 h-20 w-20 rounded-full opacity-20 blur-2xl" style={{ background: getAccent(p.accent_color).gradient }} />

              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 h-12 w-12 rounded-full overflow-hidden border border-slate-200 bg-slate-100 ring-2 ring-white shadow-sm">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt={p.full_name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white" style={{ background: getAccent(p.accent_color).gradient }}>
                        {p.full_name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900 leading-tight">{p.full_name}</h3>
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 border border-sky-100">
                      ✓ {p.gender === "F" ? "Psicóloga" : p.gender === "M" ? "Psicólogo" : "Psicólogo(a)"} · CRP {p.crp}
                    </span>
                  </div>
                </div>
                <span className={`shrink-0 pill ${p.is_accepting_patients ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"}`}>
                  {p.is_accepting_patients ? "Disponível" : "Agenda fechada"}
                </span>
              </div>

              <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-500">
                {p.specialties ?? "Especialidades não informadas"}
              </p>

              <div className="mt-4 flex items-center justify-between">
                <span className="text-base font-bold" style={{ color: getAccent(p.accent_color).solid }}>{formatPrice(p.hourly_rate, p.session_duration_minutes)}</span>
                <div className="flex items-center gap-3 text-sm">
                  {p.avg_rating !== null && p.avg_rating !== undefined ? (
                    <span className="flex items-center gap-1 text-xs">
                      <span className="text-amber-400">★</span>
                      <span className="font-semibold text-slate-700">{p.avg_rating.toFixed(1)}</span>
                      <span className="text-slate-400">({p.review_count})</span>
                    </span>
                  ) : null}
                  <span className="text-xs text-slate-400">{p.session_duration_minutes} min</span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1 text-xs font-medium text-sky-600 opacity-0 transition-opacity group-hover:opacity-100">
                Ver perfil
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
              </div>
            </Link>
          ))}
          {items.length === 0 && !loading && (
            <div className="card p-6 text-center col-span-full">
              <p className="text-sm text-slate-500">Nenhuma psicóloga encontrada com esses filtros.</p>
              <p className="mt-1 text-xs text-slate-400">Ajuste especialidade ou faixa de preço.</p>
            </div>
          )}
        </div>
      </section>

      {/* ── Por que terapia ── */}
      <section className="flex flex-col gap-8">
        <div className="text-center">
          <span className="pill bg-indigo-50 text-indigo-700 border border-indigo-100">Por que cuidar da saúde mental?</span>
          <h2 className="mt-3 text-2xl font-bold text-slate-900 md:text-3xl">
            Terapia transforma. Não é luxo, é necessidade.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-slate-500">
            Mais de 1 bilhão de pessoas no mundo sofrem com algum transtorno mental.
            A boa notícia: o tratamento psicológico funciona.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_THERAPY.map(({ icon, title, desc, bg, border, iconColor, iconBg }) => (
            <div key={title} className={`card flex flex-col gap-3 p-5 ${bg} ${border}`}>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg} ${iconColor}`}>
                {icon}
              </div>
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <p className="text-xs leading-relaxed text-slate-500">{desc}</p>
            </div>
          ))}
        </div>

        {/* Stats bar */}
        <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 to-indigo-50 p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-8">
            <div className="shrink-0 text-center md:text-left">
              <span className="text-5xl font-black text-sky-600">75%</span>
              <p className="mt-1 text-xs text-slate-500">taxa de melhora</p>
            </div>
            <p className="text-slate-600 leading-relaxed flex-1">
              das pessoas que fazem psicoterapia relatam{" "}
              <strong className="text-slate-900">melhora significativa</strong> no bem-estar,
              segundo a American Psychological Association. Dar o primeiro passo é o mais difícil.
              A gente facilita.
            </p>
            <Link
              href="/register"
              className="shrink-0 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-400 to-indigo-400 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-sky-500 hover:to-indigo-500 hover:shadow-md"
            >
              Começar agora
            </Link>
          </div>
        </div>
      </section>

      {/* ── Como funciona ── */}
      <section className="flex flex-col gap-8">
        <div className="text-center">
          <span className="pill bg-sky-50 text-sky-700 border border-sky-100">Simples assim</span>
          <h2 className="mt-3 text-2xl font-bold text-slate-900 md:text-3xl">
            Do cadastro à consulta em 3 passos
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {HOW_IT_WORKS.map(({ step, title, desc, icon, accent }) => (
            <div key={step} className="card relative overflow-hidden p-6">
              <span className="pointer-events-none absolute right-4 top-3 select-none text-6xl font-black text-slate-100">
                {step}
              </span>
              <div className="relative flex flex-col gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-md`}>
                  {icon}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Passo {step}</p>
                  <h3 className="mt-1 font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">{desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Depoimentos ── */}
      <section className="flex flex-col gap-8">
        <div className="text-center">
          <span className="pill bg-amber-50 text-amber-700 border border-amber-100">Depoimentos</span>
          <h2 className="mt-3 text-2xl font-bold text-slate-900 md:text-3xl">
            O que os pacientes dizem
          </h2>
          <p className="mt-2 text-slate-500">Experiências reais de quem já usou a plataforma</p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map(({ name, location, rating, text, initials, color }) => (
            <div key={name} className="card flex flex-col gap-4 p-6">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} className={s <= rating ? "text-amber-400" : "text-slate-200"}>★</span>
                ))}
              </div>
              <p className="flex-1 text-sm leading-relaxed text-slate-600 italic">"{text}"</p>
              <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${color} text-xs font-bold text-white shadow-sm`}>
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{name}</p>
                  <p className="text-xs text-slate-400">{location}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA final */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 p-8 text-center shadow-sm">
          <h3 className="text-xl font-bold text-slate-900">Pronto para dar o primeiro passo?</h3>
          <p className="mt-2 text-slate-500">
            Cadastre-se grátis e encontre sua psicóloga hoje mesmo.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-400 px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-sky-500 hover:to-indigo-500 hover:shadow-md"
            >
              Criar conta grátis
            </Link>
            <a
              href="#profissionais"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-400 px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-sky-500 hover:to-indigo-500 hover:shadow-md"
            >
              Ver psicólogas
            </a>
          </div>
        </div>
      </section>

    </main>
  )
}

function formatPrice(hourlyRate: string, durationMinutes: number) {
  const price = (parseFloat(hourlyRate) * durationMinutes) / 60
  return price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
