export type AccentKey =
  | "cyan-violet"
  | "sky-indigo"
  | "emerald-teal"
  | "rose-pink"
  | "amber-orange"
  | "indigo-purple"
  | "slate-blue"

export interface AccentColor {
  key: AccentKey
  label: string
  /** CSS gradient string — used in inline style */
  gradient: string
  /** Solid mid-point color — for elements on white/light backgrounds */
  solid: string
  /**
   * Text/icon color to use when rendered ON TOP of the gradient banner.
   * Dark gradients → white; light/bright gradients → dark.
   */
  onGradient: string
}

export const ACCENT_COLORS: AccentColor[] = [
  {
    key: "cyan-violet",
    label: "Ciano & Violeta",
    gradient: "linear-gradient(135deg, #06b6d4, #3b82f6, #7c3aed)",
    solid: "#3b82f6",
    onGradient: "#ffffff",
  },
  {
    key: "sky-indigo",
    label: "Azul & Índigo",
    gradient: "linear-gradient(135deg, #38bdf8, #6366f1)",
    solid: "#6366f1",
    onGradient: "#ffffff",
  },
  {
    key: "emerald-teal",
    label: "Esmeralda & Teal",
    gradient: "linear-gradient(135deg, #34d399, #0d9488)",
    solid: "#0d9488",
    onGradient: "#ffffff",
  },
  {
    key: "rose-pink",
    label: "Rosa & Pink",
    gradient: "linear-gradient(135deg, #fb7185, #ec4899)",
    solid: "#be185d",
    onGradient: "#ffffff",
  },
  {
    key: "amber-orange",
    label: "Âmbar & Laranja",
    gradient: "linear-gradient(135deg, #fbbf24, #f97316)",
    solid: "#c2410c",
    onGradient: "#431407",
  },
  {
    key: "indigo-purple",
    label: "Índigo & Roxo",
    gradient: "linear-gradient(135deg, #818cf8, #a855f7)",
    solid: "#7c3aed",
    onGradient: "#ffffff",
  },
  {
    key: "slate-blue",
    label: "Cinza & Azul",
    gradient: "linear-gradient(135deg, #64748b, #334155)",
    solid: "#334155",
    onGradient: "#ffffff",
  },
]

export const DEFAULT_ACCENT = ACCENT_COLORS[0]

export function getAccent(key: string | null | undefined): AccentColor {
  return ACCENT_COLORS.find((c) => c.key === key) ?? DEFAULT_ACCENT
}
