"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/providers/auth-context"
import { useToast } from "@/components/ui/toast"
import { authHeaders, getToken } from "@/lib/auth"
import { ACCENT_COLORS, getAccent } from "@/lib/accent-colors"

const API = "/api/v1"

type Profile = {
  id: string
  crp: string
  bio: string | null
  specialties: string | null
  hourly_rate: string
  session_duration_minutes: number
  is_accepting_patients: boolean
  is_verified: boolean
  gender: string | null
  accent_color: string | null
}

export default function ProfileEditPage() {
  const { user, loading, saveUser } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [fetching, setFetching] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form fields
  const [bio, setBio] = useState("")
  const [specialties, setSpecialties] = useState("")
  const [hourlyRate, setHourlyRate] = useState("")
  const [duration, setDuration] = useState(50)
  const [accepting, setAccepting] = useState(true)
  const [gender, setGender] = useState<string>("")
  const [accentColor, setAccentColor] = useState<string>("cyan-violet")

  // Password change
  const [currentPwd, setCurrentPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")
  const [savingPwd, setSavingPwd] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user) { router.push("/login?redirect=/dashboard/psicologa/perfil"); return }
    if (user.role !== "psychologist") { router.push("/dashboard/paciente"); return }
    ;(async () => {
      try {
        const h = authHeaders()
        const [profRes, meRes] = await Promise.all([
          fetch(`${API}/psychologists/me/profile`, { headers: h }),
          fetch(`${API}/auth/me`, { headers: h }),
        ])
        if (profRes.status === 401) { router.push("/login?redirect=/dashboard/psicologa/perfil"); return }
        if (!profRes.ok) throw new Error("Erro ao carregar perfil.")
        const data = await profRes.json()
        const p: Profile = data.profile ?? data
        setProfile(p)
        setBio(p.bio ?? "")
        setSpecialties(p.specialties ?? "")
        setHourlyRate(parseFloat(p.hourly_rate).toFixed(2))
        setDuration(p.session_duration_minutes)
        setAccepting(p.is_accepting_patients)
        setGender(p.gender ?? "")
        setAccentColor(p.accent_color ?? "cyan-violet")
        if (meRes.ok) {
          const me = await meRes.json()
          setAvatarUrl(me.avatar_url ?? null)
        }
      } catch (e: any) {
        toast(e.message, "error")
      } finally {
        setFetching(false)
      }
    })()
  }, [user, loading, router])

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const allowed = ["image/jpeg", "image/png", "image/webp"]
    if (!allowed.includes(file.type)) {
      toast("Formato não suportado. Use JPEG, PNG ou WebP.", "error")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("Imagem muito grande. Máximo: 5 MB.", "error")
      return
    }

    setUploadingAvatar(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`${API}/auth/me/avatar`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? "Erro ao enviar foto.")
      }
      const data = await res.json()
      setAvatarUrl(data.avatar_url)
      if (user) saveUser({ ...user, avatar_url: data.avatar_url }, getToken()!)
      toast("Foto atualizada com sucesso!", "success")
    } catch (e: any) {
      toast(e.message, "error")
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleRemoveAvatar() {
    if (!confirm("Remover sua foto de perfil?")) return
    setUploadingAvatar(true)
    try {
      const res = await fetch(`${API}/auth/me/avatar`, {
        method: "DELETE",
        headers: authHeaders(),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? "Erro ao remover foto.")
      }
      setAvatarUrl(null)
      if (user) saveUser({ ...user, avatar_url: null }, getToken()!)
      toast("Foto removida.", "info")
    } catch (e: any) {
      toast(e.message, "error")
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPwd.length < 8) { toast("Nova senha deve ter pelo menos 8 caracteres.", "error"); return }
    if (newPwd !== confirmPwd) { toast("As senhas não coincidem.", "error"); return }
    setSavingPwd(true)
    try {
      const res = await fetch(`${API}/auth/me/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ current_password: currentPwd, new_password: newPwd }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? "Erro ao trocar senha.")
      }
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("")
      toast("Senha alterada com sucesso!", "success")
    } catch (e: any) {
      toast(e.message, "error")
    } finally {
      setSavingPwd(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const rate = parseFloat(hourlyRate)
    if (isNaN(rate) || rate < 0) {
      toast("Valor por hora inválido.", "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`${API}/psychologists/me/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          bio: bio.trim() || null,
          specialties: specialties.trim() || null,
          hourly_rate: rate,
          session_duration_minutes: duration,
          is_accepting_patients: accepting,
          gender: gender || null,
          accent_color: accentColor,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? "Erro ao salvar perfil.")
      }
      toast("Perfil atualizado com sucesso!", "success")
      // Invalidate Next.js router cache so public pages (home, /psicologas/[id])
      // show the updated values on next navigation without stale data.
      router.refresh()
    } catch (e: any) {
      toast(e.message, "error")
    } finally {
      setSaving(false)
    }
  }

  const initials = user?.full_name?.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase() ?? "?"

  if (loading || fetching) {
    return (
      <div className="grid gap-4 animate-pulse">
        {[1, 2, 3].map((n) => <div key={n} className="card h-20 bg-slate-900/50" />)}
      </div>
    )
  }

  return (
    <main className="flex flex-col gap-6">

      {/* Header */}
      <div className="card relative overflow-hidden p-6 md:p-8">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative">
          <p className="text-xs uppercase tracking-widest text-slate-500">Painel profissional</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-50">Meu Perfil</h1>
          <p className="mt-1 text-sm text-slate-400">
            Essas informações aparecem para os pacientes ao buscarem psicólogas.
          </p>
        </div>
      </div>

      {/* Avatar upload */}
      <div className="card p-5 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative shrink-0 h-24 w-24">
          <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-white/10 bg-slate-800 shadow-lg">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 text-2xl font-bold text-slate-100">
                {initials}
              </div>
            )}
          </div>
          {uploadingAvatar && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/60">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-slate-200">Foto de perfil</p>
          <p className="text-xs text-slate-500">
            Aparece na listagem e na sua página pública. JPEG, PNG ou WebP, máx. 5 MB.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={uploadingAvatar}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-50 transition-colors"
            >
              {uploadingAvatar ? "Enviando…" : avatarUrl ? "Trocar foto" : "Enviar foto"}
            </button>
            {avatarUrl && (
              <button
                type="button"
                disabled={uploadingAvatar}
                onClick={handleRemoveAvatar}
                className="inline-flex w-fit items-center gap-2 rounded-xl border border-red-500/20 px-4 py-2 text-sm text-red-400 hover:border-red-500/40 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
              >
                Remover foto
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CRP badge (read-only) */}
      {profile && (
        <div className="flex flex-wrap gap-3">
          <span className="rounded-xl border border-white/10 bg-slate-900/40 px-4 py-2 text-sm text-slate-400">
            CRP: <span className="font-semibold text-slate-200">{profile.crp}</span>
          </span>
          {profile.is_verified ? (
            <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
              ✓ Verificada
            </span>
          ) : (
            <span className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
              ⏳ Aguardando verificação
            </span>
          )}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSave} className="flex flex-col gap-5">

        <div className="card p-5 flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Biografia
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="Conte sobre sua abordagem, experiência e como você pode ajudar..."
            className="w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-emerald-500/50 transition-colors"
          />
          <p className="text-right text-[10px] text-slate-600">{bio.length}/2000</p>
        </div>

        <div className="card p-5 flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Especialidades
          </label>
          <input
            type="text"
            value={specialties}
            onChange={(e) => setSpecialties(e.target.value)}
            maxLength={500}
            placeholder="ex: Ansiedade, Depressão, TCC, Casais"
            className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-emerald-500/50 transition-colors"
          />
          <p className="text-xs text-slate-600">Separe por vírgulas. Facilita a busca por pacientes.</p>
        </div>

        <div className="card p-5 flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Cor do perfil
          </label>
          <div className="flex flex-wrap gap-3">
            {ACCENT_COLORS.map((c) => {
              const selected = accentColor === c.key
              return (
                <button
                  key={c.key}
                  type="button"
                  title={c.label}
                  onClick={() => setAccentColor(c.key)}
                  className={[
                    "relative h-9 w-9 rounded-full transition-all",
                    selected ? "scale-110 ring-2 ring-offset-2 ring-slate-400" : "opacity-70 hover:opacity-100 hover:scale-105",
                  ].join(" ")}
                  style={{ background: c.gradient }}
                >
                  {selected && (
                    <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">✓</span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-600">
            Aparece no banner e no avatar do seu perfil público. Atual: <span className="font-medium">{getAccent(accentColor).label}</span>
          </p>
        </div>

        <div className="card p-5 flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Gênero
          </label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-500/50 transition-colors"
          >
            <option value="">Prefiro não informar</option>
            <option value="F">Feminino (psicóloga)</option>
            <option value="M">Masculino (psicólogo)</option>
          </select>
          <p className="text-xs text-slate-600">Usado para exibir o título correto no seu perfil público.</p>
        </div>

        <div className="card p-5 flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Sessão</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-400">Valor por hora (R$)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">R$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/60 py-3 pl-9 pr-4 text-sm text-slate-100 outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-400">Duração da sessão (min)</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-500/50 transition-colors"
              >
                {[15, 30, 45, 50, 60, 90, 120].map((v) => (
                  <option key={v} value={v}>{v} minutos</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card flex items-center justify-between p-5">
          <div>
            <p className="text-sm font-medium text-slate-200">Aceitando novos pacientes</p>
            <p className="text-xs text-slate-500">
              {accepting
                ? "Você aparece na busca e pode receber agendamentos."
                : "Você está oculta da busca. Nenhum novo agendamento será aceito."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={accepting}
            onClick={() => setAccepting((v) => !v)}
            className={[
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full",
              "border-2 border-transparent transition-colors duration-200",
              accepting ? "bg-emerald-500" : "bg-slate-700",
            ].join(" ")}
          >
            <span className={[
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
              accepting ? "translate-x-5" : "translate-x-0",
            ].join(" ")} />
          </button>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-8 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60 transition-all"
          >
            {saving ? "Salvando…" : "Salvar perfil"}
          </button>
        </div>
      </form>

      {/* ── Trocar senha ── */}
      <form onSubmit={handleChangePassword} className="card p-5 flex flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Trocar senha</p>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-slate-400">Senha atual</label>
          <input
            type="password"
            required
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-500/50 transition-colors"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-400">Nova senha (mín. 8 caracteres)</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-400">Confirmar nova senha</label>
            <input
              type="password"
              required
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              className={[
                "rounded-xl border bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none transition-colors",
                confirmPwd && confirmPwd !== newPwd
                  ? "border-red-500/50 focus:border-red-400"
                  : "border-white/10 focus:border-emerald-500/50",
              ].join(" ")}
            />
            {confirmPwd && confirmPwd !== newPwd && (
              <p className="text-xs text-red-400">As senhas não coincidem.</p>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingPwd}
            className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-8 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60 transition-all"
          >
            {savingPwd ? "Salvando…" : "Trocar senha"}
          </button>
        </div>
      </form>

    </main>
  )
}
