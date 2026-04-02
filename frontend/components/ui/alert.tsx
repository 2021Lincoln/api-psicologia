import { cn } from "@/lib/utils"
import { type HTMLAttributes } from "react"

type Variant = "info" | "success" | "warning" | "error"

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant
}

const variants: Record<Variant, string> = {
  info: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  error: "border-red-500/30 bg-red-500/10 text-red-200",
}

export function Alert({ className, variant = "info", ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm leading-relaxed", className)} {...props} />
}
