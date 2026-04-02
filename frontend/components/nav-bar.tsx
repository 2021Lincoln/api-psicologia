"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/providers/auth-context"

function NavLink({
  href,
  children,
  exact = false,
}: {
  href: string
  children: React.ReactNode
  exact?: boolean
}) {
  const path = usePathname()
  const active = exact ? path === href : path.startsWith(href)
  return (
    <Link
      href={href}
      className={[
        "relative text-sm font-medium transition-colors",
        active
          ? "text-sky-600 after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-full after:rounded-full after:bg-gradient-to-r after:from-sky-300 after:to-indigo-300"
          : "text-slate-500 hover:text-slate-900",
      ].join(" ")}
    >
      {children}
    </Link>
  )
}

const btnPastel = "rounded-xl bg-gradient-to-r from-sky-400 to-indigo-400 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:from-sky-500 hover:to-indigo-500 hover:shadow-md"

export function NavBar() {
  const { user, loading, logout } = useAuth()
  const router = useRouter()

  function handleLogout() {
    logout()
    router.push("/")
  }

  return (
    <header className="mb-8 flex items-center justify-between">
      {/* Logo */}
      <Link href="/" className="group flex items-center gap-3">
        <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-md shadow-sky-400/30 transition-all group-hover:shadow-sky-400/50 group-hover:brightness-105">
          <span className="select-none text-[22px] font-bold leading-none text-white">Ψ</span>
        </div>
        <div className="leading-none">
          <p className="text-[18px] font-bold tracking-tight text-slate-900">
            Psico<span className="bg-gradient-to-r from-sky-500 to-indigo-500 bg-clip-text text-transparent">Connect</span>
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-400">
            Marketplace de Psicologia
          </p>
        </div>
      </Link>

      {/* Nav links */}
      <nav className="flex items-center gap-2 sm:gap-4">
        {(!user || user.role === "patient") && (
          <Link href="/" className={`hidden sm:inline-flex items-center ${btnPastel}`}>
            Início
          </Link>
        )}

        {!loading && (
          <>
            {user ? (
              <>
                {user.role === "patient" && (
                  <span className="hidden sm:inline">
                    <NavLink href="/dashboard/paciente">Minhas consultas</NavLink>
                  </span>
                )}
                {user.role === "psychologist" && (
                  <span className="hidden sm:inline">
                    <NavLink href="/dashboard/psicologa">Minha agenda</NavLink>
                  </span>
                )}
                {user.role === "admin" && (
                  <span className="hidden sm:inline">
                    <NavLink href="/dashboard/admin">Admin</NavLink>
                  </span>
                )}
                <span className="hidden sm:inline text-sm font-medium text-slate-700">
                  {user.full_name.split(" ")[0]}
                </span>
                <button
                  onClick={handleLogout}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                >
                  Sair
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className={`${btnPastel} sm:px-4`}>
                  Entrar
                </Link>
                <Link href="/register" className={`${btnPastel} sm:px-4`}>
                  <span className="sm:hidden">Cadastrar</span>
                  <span className="hidden sm:inline">Cadastrar grátis</span>
                </Link>
              </>
            )}
          </>
        )}
      </nav>
    </header>
  )
}
