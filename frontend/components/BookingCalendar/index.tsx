"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CreditCard, AlertCircle } from "lucide-react";

import { CalendarGrid } from "./CalendarGrid";
import { SlotPicker } from "./SlotPicker";
import { useAvailableSlots } from "@/hooks/useAvailableSlots";
import { createCheckoutSession, formatDateParam, formatPrice, formatSlotTime } from "@/lib/bookingApi";
import { PsychologistProfile, TimeSlot } from "@/types/booking";

interface BookingCalendarProps {
  psychologist: PsychologistProfile;
  patientEmail: string;      // from auth session — passed by the parent Server Component
  appointmentId?: string;    // pre-created appointment ID (if your flow books first, pays later)
}

export function BookingCalendar({
  psychologist,
  patientEmail,
  appointmentId,
}: BookingCalendarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const { slots, status, error, refetch } = useAvailableSlots(
    psychologist.id,
    selectedDate
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSelectDate(date: Date) {
    setSelectedDate(date);
    setSelectedSlot(null);   // reset slot when date changes
    setCheckoutError(null);
  }

  function handleSelectSlot(slot: TimeSlot) {
    setSelectedSlot(slot);
    setCheckoutError(null);
  }

  function handleConfirm() {
    if (!selectedSlot || !appointmentId) return;

    setCheckoutError(null);

    startTransition(async () => {
      try {
        const { checkout_url } = await createCheckoutSession(
          appointmentId,
          patientEmail
        );
        // Hard navigation to Stripe Checkout (external URL)
        window.location.href = checkout_url;
      } catch (err) {
        setCheckoutError(
          err instanceof Error ? err.message : "Erro ao iniciar o pagamento."
        );
      }
    });
  }

  // ── Derived display values ─────────────────────────────────────────────────

  const sessionPrice = formatPrice(
    psychologist.hourly_rate,
    psychologist.session_duration_minutes
  );

  const formattedSelectedDate = selectedDate
    ? selectedDate.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8 lg:items-start">

      {/* ── LEFT: Calendar ── */}
      <div className="flex-shrink-0 w-full lg:w-80 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <CalendarDays className="w-5 h-5 text-violet-500" />
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Escolha o dia
          </h2>
        </div>

        <CalendarGrid
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
        />
      </div>

      {/* ── RIGHT: Slot picker + Confirm ── */}
      <div className="flex flex-1 flex-col gap-4">

        {/* Slot list */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
              {formattedSelectedDate
                ? <span className="capitalize">{formattedSelectedDate}</span>
                : "Horários disponíveis"}
            </h2>
            {status === "success" && slots.length > 0 && (
              <span className="text-xs text-slate-400">
                {slots.length} horário{slots.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <SlotPicker
            slots={slots}
            status={status}
            error={error}
            selectedSlot={selectedSlot}
            onSelectSlot={handleSelectSlot}
            onRetry={refetch}
          />
        </div>

        {/* Confirm panel — only visible when a slot is selected */}
        {selectedSlot && (
          <div className="rounded-2xl border-2 border-violet-200 bg-violet-50 p-5 shadow-sm">
            {/* Summary */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-xs text-violet-500 font-medium uppercase tracking-wide mb-0.5">
                  Sessão selecionada
                </p>
                <p className="text-base font-bold text-slate-800">
                  {formatSlotTime(selectedSlot.start)}
                  <span className="text-slate-400 font-normal mx-1">–</span>
                  {formatSlotTime(selectedSlot.end)}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 capitalize">
                  {formattedSelectedDate} · {selectedSlot.duration_minutes} min
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-violet-500 font-medium uppercase tracking-wide mb-0.5">
                  Valor
                </p>
                <p className="text-xl font-bold text-slate-800">{sessionPrice}</p>
              </div>
            </div>

            {/* Error banner */}
            {checkoutError && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5 mb-4">
                <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-rose-700">{checkoutError}</p>
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handleConfirm}
              disabled={isPending || !appointmentId}
              className={[
                "w-full flex items-center justify-center gap-2 rounded-xl py-3.5 px-4",
                "text-sm font-bold tracking-wide transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
                isPending
                  ? "bg-violet-400 text-white cursor-not-allowed"
                  : "bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.98] shadow-md hover:shadow-lg",
              ].join(" ")}
            >
              <CreditCard className="w-4 h-4" />
              {isPending ? "Redirecionando…" : "Confirmar e Pagar"}
            </button>

            <p className="text-center text-[11px] text-slate-400 mt-3">
              Você será redirecionado ao Stripe para finalizar o pagamento com segurança
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
