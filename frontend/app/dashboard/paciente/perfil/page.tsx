"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/providers/auth-context"
import { useToast } from "@/components/ui/toast"
import { authHeaders, getToken } from "@/lib/auth"

const API = "/api/v1"

export default function PatientProfilePage() {
  const { user, loading, saveUser } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  const [fetching, setFetching] = useState(true)
  const [savingInfo, setSavingInfo] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Profile fields
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  // Password fields
  const [currentPwd, setCurrentPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (loading) return
    if (!user) { router.push("/login?redirect=/dashboard/paciente/perfil"); return }
    if (user.role !== "patient") { router.push("/dashboard/psicologa"); return }
    ;(async () => {
      try {
        const res = await fetch(`${API}/auth/me`, { headers: authHeaders() })
        if (res.status === 401) { router.push("/login?redirect=/dashboard/paciente/perfil"); return }
        if (!res.ok) throw new Error("Erro ao carregar perfil.")
        const me = await res.json()
        setFullName(me.full_name ?? "")
        setPhone(me.phone ?? "")
        setAvatarUrl(me.avatar_url ?? null)
      } catch (e: any) {
        toast(e.message, "error")
      } finally {
        setFetching(false)
      }
    })()
  }, [user, loading, router])

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || fullName.trim().length < 2) {
      toast("Nome deve ter pelo menos 2 caracteres.", "error")
      return
    }
    setSavingInfo(true)
    try {
      const res = await fetch(`${API}/auth/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? "Erro ao salvar.")
      }
      toast("Dados atualizados com sucesso!", "success")
    } catch (e: any) {
      toast(e.message, "error")
    } finally {
      setSavingInfo(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPwd.length < 8) {
      toast("Nova senha deve ter pelo menos 8 caracteres.", "error")
      return
    }
    if (newPwd !== confirmPwd) {
      toast("As senhas não coincidem.", "error")
      return
    }
    setSavingPwd(true)
    try {
      const res = await fetch(`${API}/auth/me/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          current_password: currentPwd,
          new_password: newPwd,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? "Erro ao trocar senha.")
      }
      setCurrentPwd("")
      setNewPwd("")
      setConfirmPwd("")
      toast("Senha alterada com sucesso!", "success")
    } catch (e: any) {
      toast(e.message, "error")
    } finally {
      setSavingPwd(false)
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
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
      toast("Foto atualizada!", "success")
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

  const initials = fullName.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "?"

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
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative">
          <p className="text-xs uppercase tracking-widest text-slate-500">Painel do paciente</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-50">Meu Perfil</h1>
          <p className="mt-1 text-sm text-slate-400">Gerencie seus dados pessoais e segurança da conta.</p>
        </div>
      </div>

      {/* Avatar */}
      <div className="card p-5 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative shrink-0 h-24 w-24">
          <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-white/10 bg-slate-800 shadow-lg">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500/30 to-violet-500/30 text-2xl font-bold text-slate-100">
                {initials}
              </div>
            )}
          </div>
          {uploadingAvatar && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/60">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-slate-200">Foto de perfil</p>
          <p className="text-xs text-slate-500">JPEG, PNG ou WebP, máx. 5 MB.</p>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={uploadingAvatar}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50 transition-colors"
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

      {/* Personal info */}
      <form onSubmit={handleSaveInfo} className="card p-5 flex flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Dados pessoais</p>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-slate-400">Nome completo</label>
          <input
            type="text"
            required
            minLength={2}
            maxLength={120}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50 transition-colors"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-slate-400">Telefone (opcional)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(11) 99999-9999"
            className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-500/50 transition-colors"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingInfo}
            className="rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60 transition-all"
          >
            {savingInfo ? "Salvando…" : "Salvar dados"}
          </button>
        </div>
      </form>

      {/* Change password */}
      <form onSubmit={handleChangePassword} className="card p-5 flex flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Trocar senha</p>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-slate-400">Senha atual</label>
          <input
            type="password"
            required
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50 transition-colors"
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
              className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50 transition-colors"
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
                  : "border-white/10 focus:border-cyan-500/50",
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
            className="rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60 transition-all"
          >
            {savingPwd ? "Salvando…" : "Trocar senha"}
          </button>
        </div>
      </form>

    </main>
  )
}
