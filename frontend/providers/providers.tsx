"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { type ReactNode } from "react"

import { queryClient } from "@/lib/query-client"
import { AuthProvider } from "./auth-context"
import { ToastProvider } from "@/components/ui/toast"

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
