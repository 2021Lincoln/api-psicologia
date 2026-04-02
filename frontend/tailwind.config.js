/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./providers/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    "bg-amber-200", "bg-amber-300",
    "bg-lime-200",  "bg-lime-300",
    "bg-sky-200",   "bg-sky-300",
    "bg-rose-200",  "bg-rose-300",
    "bg-violet-200","bg-violet-300",
    "text-slate-800",
    // Why therapy card colors
    "bg-cyan-50", "bg-violet-50", "bg-emerald-50", "bg-amber-50",
    "border-cyan-100", "border-violet-100", "border-emerald-100", "border-amber-100",
    "text-cyan-600", "text-violet-600", "text-emerald-600", "text-amber-600",
    "bg-cyan-100", "bg-violet-100", "bg-emerald-100", "bg-amber-100",
    // How it works
    "from-cyan-500", "from-violet-500", "from-emerald-500",
    "to-blue-500", "to-purple-500", "to-cyan-500",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui"],
      },
      colors: {
        brand: {
          cyan: "#0891b2",
          violet: "#7c3aed",
        },
      },
      boxShadow: {
        "glow-cyan":   "0 0 20px rgba(8, 145, 178, 0.25)",
        "glow-violet": "0 0 20px rgba(124, 58, 237, 0.25)",
      },
      animation: {
        "fade-in":  "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
