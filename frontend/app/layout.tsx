import type { Metadata } from "next"
import { Inter } from "next/font/google"
import type { ReactNode } from "react"

import { Providers } from "@/providers/providers"
import { ConditionalShell } from "@/components/conditional-shell"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
})

export const metadata: Metadata = {
  title: "PsicoConnect · Saúde mental sem atrito",
  description: "Conecte-se com psicólogas verificadas, agende online e consulte por vídeo. Sem burocracia, sem fila.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} ${inter.className} min-h-screen antialiased`}>
        <Providers>
          <ConditionalShell>{children}</ConditionalShell>
        </Providers>
      </body>
    </html>
  )
}
