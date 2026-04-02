import type { CheckoutResponse, PsychologistProfile, TimeSlot } from "@/types/booking"

const API_BASE = "/api/v1"

// ── Typed fetcher ──────────────────────────────────────────────────────────────

async function fetcher<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    // Throw with the API's detail message so React Query surfaces it correctly
    throw new Error(body?.detail ?? `Erro ${res.status}: ${res.statusText}`)
  }

  return res.json()
}

// ── Query key factory ─────────────────────────────────────────────────────────
// Centralised keys prevent typos and enable surgical cache invalidation.

export const appointmentKeys = {
  all: ["appointments"] as const,

  slots: () => [...appointmentKeys.all, "slots"] as const,
  slotsByPsychologist: (id: string) =>
    [...appointmentKeys.slots(), id] as const,
  slotsByDate: (id: string, date: string) =>
    [...appointmentKeys.slotsByPsychologist(id), date] as const,

  psychologist: (id: string) => ["psychologist", id] as const,
}

// ── API functions ──────────────────────────────────────────────────────────────

export function toDateParam(date: Date): string {
  // Use local date parts to avoid UTC conversion shifting the day for Brazilian users (UTC-3).
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}` // "YYYY-MM-DD" in local time
}

export async function fetchSlots(
  psychologistProfileId: string,
  date: Date,
  tz = "America/Sao_Paulo",
): Promise<TimeSlot[]> {
  if (!psychologistProfileId) {
    throw new Error("ID da psicologa ausente.")
  }
  const params = new URLSearchParams({ day: toDateParam(date), tz })
  return fetcher(
    `${API_BASE}/psychologists/${psychologistProfileId}/slots?${params}`,
    { cache: "no-store" },
  )
}

export async function fetchPsychologistProfile(
  id: string
): Promise<PsychologistProfile> {
  if (!id) {
    throw new Error("ID da psicologa ausente.")
  }
  return fetcher(`${API_BASE}/psychologists/${id}`)
}

export async function createCheckoutSession(payload: {
  appointment_id: string
  customer_email: string
}): Promise<CheckoutResponse> {
  return fetcher(`${API_BASE}/payments/checkout`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function formatSlotTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
}

export function formatPrice(hourlyRate: string, durationMinutes: number): string {
  const price = (parseFloat(hourlyRate) * durationMinutes) / 60
  return price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
