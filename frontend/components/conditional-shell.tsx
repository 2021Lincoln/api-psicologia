"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { NavBar } from "./nav-bar"

export function ConditionalShell({ children }: { children: ReactNode }) {
  const path = usePathname()
  const isDashboard = path.startsWith("/dashboard")

  if (isDashboard) {
    // Dashboard pages use their own full-screen layout
    return <>{children}</>
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <NavBar />
      {children}
      <footer className="mt-12 flex flex-col items-center gap-3 border-t border-white/5 pt-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 text-[11px] font-bold text-slate-950">Ψ</span>
          <span className="text-xs font-semibold text-slate-400">PsicoConnect</span>
          <span className="text-xs text-slate-600">· Saúde mental sem atrito</span>
        </div>
        <span className="text-xs text-slate-600">suporte@psico.app</span>
      </footer>
    </div>
  )
}
