import { cn } from "@/lib/utils"
import { type ButtonHTMLAttributes, forwardRef } from "react"

type Variant = "primary" | "outline" | "ghost" | "danger" | "success"
type Size = "sm" | "md" | "lg" | "icon"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-cyan-500 to-violet-500 text-slate-950 font-semibold hover:brightness-110 shadow-lg shadow-cyan-500/20 active:scale-[0.98]",
  outline:
    "border border-white/15 text-slate-300 hover:border-white/30 hover:text-slate-100 hover:bg-white/5",
  ghost: "text-slate-400 hover:text-slate-200 hover:bg-white/5",
  danger:
    "border border-red-500/30 text-red-300 hover:border-red-400/60 hover:bg-red-500/10",
  success:
    "bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-semibold hover:brightness-110 shadow-lg shadow-emerald-500/20 active:scale-[0.98]",
}

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg h-7",
  md: "px-4 py-2 text-sm rounded-xl h-9",
  lg: "px-6 py-3 text-sm rounded-xl h-11",
  icon: "p-2 rounded-xl h-9 w-9",
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150",
        "disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = "Button"
