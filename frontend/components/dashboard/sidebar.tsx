"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import { useAuth } from "@/providers/auth-context"
import { cn } from "@/lib/utils"

export interface NavItem {
  label: string
  href: string
  icon: ReactNode
  badge?: number
}

interface SidebarProps {
  items: NavItem[]
  accentClass?: string
  title: string
  subtitle: string
}

export function DashboardSidebar({
  items,
  accentClass = "from-cyan-500 to-violet-500",
  title,
  subtitle,
}: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)

  function handleLogout() {
    logout()
    router.push("/")
  }

  const initials = user?.full_name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  const dashboardHref =
    user?.role === "psychologist" ? "/dashboard/psicologa"
    : user?.role === "admin"      ? "/dashboard/admin"
    : "/dashboard/paciente"

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="border-b border-sky-100/70 px-5 py-5">
        <Link href={dashboardHref} className="group flex items-center gap-3" onClick={() => setOpen(false)}>
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-md transition-all group-hover:brightness-110",
              accentClass,
            )}
          >
            <span className="select-none text-[17px] font-bold leading-none text-white">Ψ</span>
          </div>
          <div className="leading-none">
            <p className="text-[15px] font-bold tracking-tight text-slate-900">
              Psico<span className={cn("bg-gradient-to-r bg-clip-text text-transparent", accentClass)}>Connect</span>
            </p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">{title}</p>
          </div>
        </Link>
      </div>

      {/* Nav section label */}
      <p className="px-5 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        {subtitle}
      </p>

      {/* Nav items */}
      <nav className="flex-1 space-y-0.5 px-3 pb-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-white/80 text-slate-900 shadow-sm shadow-sky-100/50"
                  : "text-slate-500 hover:bg-white/50 hover:text-slate-900",
              )}
            >
              {active && (
                <span
                  className={cn(
                    "absolute left-0 h-5 w-0.5 rounded-r-full bg-gradient-to-b",
                    accentClass,
                  )}
                />
              )}
              <span
                className={cn(
                  "relative shrink-0 transition-colors duration-150",
                  active ? "text-slate-700" : "text-slate-400 group-hover:text-slate-600",
                )}
              >
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-sky-100/70 p-3">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-sm",
              accentClass,
            )}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-900">{user?.full_name}</p>
            <p className="truncate text-[10px] text-slate-400">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sair"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sky-100/70 bg-gradient-to-b from-sky-50 to-indigo-50/40 md:flex">
        {sidebarContent}
      </aside>

      {/* Mobile: top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm md:hidden">
        <Link href={dashboardHref} className="flex items-center gap-2.5">
          <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm", accentClass)}>
            <span className="select-none text-[13px] font-bold leading-none text-white">Ψ</span>
          </div>
          <span className="text-sm font-bold text-slate-900">
            Psico<span className={cn("bg-gradient-to-r bg-clip-text text-transparent", accentClass)}>Connect</span>
          </span>
        </Link>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95"
          aria-label="Abrir menu"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile: drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 border-r border-sky-100/70 bg-gradient-to-b from-sky-50 to-indigo-50/40 shadow-xl animate-in slide-in-from-left duration-200 md:hidden">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  )
}
