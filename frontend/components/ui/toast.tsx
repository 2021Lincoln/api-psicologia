"use client"

import { cn } from "@/lib/utils"
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"

type ToastType = "success" | "error" | "info" | "warning"

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void
}

const Ctx = createContext<ToastCtx | null>(null)

const typeStyles: Record<ToastType, string> = {
  success: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  error: "border-red-500/40 bg-red-500/15 text-red-200",
  info: "border-cyan-500/40 bg-cyan-500/15 text-cyan-200",
  warning: "border-amber-500/40 bg-amber-500/15 text-amber-200",
}

const typeIcons: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  warning: "⚠",
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) { clearTimeout(timer); timers.current.delete(id) }
  }, [])

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev.slice(-4), { id, message, type }])
    const timer = setTimeout(() => dismiss(id), 4000)
    timers.current.set(id, timer)
  }, [dismiss])

  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl",
              "animate-in slide-in-from-right-4 fade-in duration-200",
              typeStyles[t.type],
            )}
          >
            <span className="mt-0.5 shrink-0 font-bold">{typeIcons[t.type]}</span>
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="ml-2 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useToast must be used inside ToastProvider")
  return ctx
}
