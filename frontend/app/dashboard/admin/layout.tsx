"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { DashboardSidebar, type NavItem } from "@/components/dashboard/sidebar"
import { PageTransition } from "@/components/page-transition"
import { authHeaders } from "@/lib/auth"

const API = "/api/v1"

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    fetch(`${API}/psychologists/admin/pending`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : [])
      .then((data: unknown[]) => setPendingCount(data.length))
      .catch(() => {})
  }, [])

  const navItems: NavItem[] = [
    {
      label: "Visão Geral",
      href: "/dashboard/admin",
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
  ]

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <DashboardSidebar
        items={navItems}
        accentClass="from-violet-500 to-fuchsia-500"
        title="Admin"
        subtitle="Administração"
      />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  )
}
