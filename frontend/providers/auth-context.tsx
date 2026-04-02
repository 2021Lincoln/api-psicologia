"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

import {
  type AuthUser,
  clearAuth,
  getUser,
  setAuth,
} from "@/lib/auth"

const API = "/api/v1"

type AuthCtx = {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  logout: () => void
  saveUser: (user: AuthUser, token: string) => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setUser(getUser())
    setLoading(false)
  }, [])

  const saveUser = useCallback((u: AuthUser, token: string) => {
    setAuth(token, u)
    setUser(u)
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const res = await fetch(`${API}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: email, password }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? "E-mail ou senha incorretos.")
    }
    const { access_token } = await res.json()

    const meRes = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (!meRes.ok) throw new Error("Erro ao carregar dados do usuário.")
    const me = await meRes.json()

    const authUser: AuthUser = { id: me.id, full_name: me.full_name, email: me.email, role: me.role, avatar_url: me.avatar_url ?? null }
    saveUser(authUser, access_token)
    return authUser
  }, [saveUser])

  const logout = useCallback(() => {
    clearAuth()
    setUser(null)
  }, [])

  return (
    <Ctx.Provider value={{ user, loading, login, logout, saveUser }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
