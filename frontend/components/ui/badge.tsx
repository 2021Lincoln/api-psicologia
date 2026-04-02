import { cn } from "@/lib/utils"
import { type HTMLAttributes } from "react"

type Variant = "default" | "success" | "warning" | "error" | "info" | "neutral"

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
}

const variants: Record<Variant, string> = {
  default: "bg-white/10 text-slate-300 border-white/10",
  success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  error: "bg-red-500/15 text-red-300 border-red-500/20",
  info: "bg-cyan-500/15 text-cyan-300 border-cyan-500/20",
  neutral: "bg-slate-500/15 text-slate-400 border-slate-500/20",
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
