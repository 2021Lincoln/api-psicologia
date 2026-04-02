"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

/**
 * Re-mounts children with a CSS slide-in animation on every route change.
 * Uses key={pathname} so Next.js App Router recreates the div on navigation,
 * triggering tailwindcss-animate's `animate-in` classes.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return (
    <div
      key={pathname}
      className="animate-in fade-in slide-in-from-right-4 duration-300 fill-mode-both"
    >
      {children}
    </div>
  )
}
