import { CheckoutResponse, TimeSlot } from "@/types/booking";

const API_BASE = "/api/v1";

/**
 * Fetch available slots for a psychologist on a given date.
 * Maps to: GET /psychologists/{id}/slots?date=YYYY-MM-DD
 */
export async function fetchAvailableSlots(
  psychologistProfileId: string,
  date: Date
): Promise<TimeSlot[]> {
  if (!psychologistProfileId) {
    throw new Error("ID da psicologa ausente.");
  }
  const dateStr = formatDateParam(date);
  const res = await fetch(
    `${API_BASE}/psychologists/${psychologistProfileId}/slots?date=${dateStr}`,
    { next: { revalidate: 0 } }  // always fresh — slot availability changes frequently
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch slots: ${res.status}`);
  }

  return res.json();
}

/**
 * Create a Stripe Checkout Session for the selected slot.
 * Maps to: POST /payments/checkout
 */
export async function createCheckoutSession(
  appointmentId: string,
  customerEmail: string
): Promise<CheckoutResponse> {
  const res = await fetch(`${API_BASE}/payments/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appointment_id: appointmentId, customer_email: customerEmail }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error?.detail ?? `Checkout failed: ${res.status}`);
  }

  return res.json();
}

// ---- helpers ----------------------------------------------------------------

export function formatDateParam(date: Date): string {
  return date.toISOString().split("T")[0];  // "YYYY-MM-DD"
}

export function formatSlotTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export function formatPrice(hourlyRate: string, durationMinutes: number): string {
  const price = (parseFloat(hourlyRate) * durationMinutes) / 60;
  return price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
