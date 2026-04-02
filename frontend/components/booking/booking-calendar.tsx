"use client"

import { useQueryClient } from "@tanstack/react-query"
import { CalendarDays } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useCreateCheckout } from "@/hooks/use-checkout"
import { useAvailableSlots } from "@/hooks/use-slots"
import { appointmentKeys } from "@/lib/api/appointments"
import type { PsychologistProfile, TimeSlot } from "@/types/booking"
import { CalendarGrid } from "./calendar-grid"
import { ConfirmPanel } from "./confirm-panel"
import { SlotPicker } from "./slot-picker"

interface BookingCalendarProps {
  psychologist: PsychologistProfile
  patientEmail: string
  appointmentId?: string
}

export function BookingCalendar({
  psychologist,
  patientEmail,
  appointmentId,
}: BookingCalendarProps) {
  const queryClient = useQueryClient()
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { slots, isLoading, isFetching, isError, error, prefetchDay } =
    useAvailableSlots(psychologist.id, selectedDate)

  const checkout = useCreateCheckout()

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSelectDate(date: Date) {
    setSelectedDate(date)
    setSelectedSlot(null)
    checkout.reset() // clear previous payment errors
  }

  function handleSelectSlot(slot: TimeSlot) {
    setSelectedSlot(slot)
    checkout.reset()
  }

  function handleConfirm() {
    if (!appointmentId) return
    checkout.mutate({ appointment_id: appointmentId, customer_email: patientEmail })
  }

  /**
   * Prefetch on day hover: by the time the user clicks, data is already cached.
   * If the cache is fresh (< 30s), this is a no-op.
   */
  function handleHoverDate(date: Date) {
    prefetchDay(date)
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const formattedDate = selectedDate
    ? selectedDate.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : null

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">

      {/* ── LEFT: Calendar card ── */}
      <Card className="shrink-0 w-full lg:w-80">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            Escolha o dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CalendarGrid
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            onHoverDate={handleHoverDate}
          />
        </CardContent>
      </Card>

      {/* ── RIGHT: Slots + Confirm ── */}
      <div className="flex flex-1 flex-col gap-4 min-w-0">

        {/* Slot picker card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {formattedDate ? (
                  <span className="capitalize text-foreground">{formattedDate}</span>
                ) : (
                  "Horários disponíveis"
                )}
              </CardTitle>

              {/* Slot count badge — fades in when data is loaded */}
              {!isLoading && slots.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {slots.length} horário{slots.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <SlotPicker
              slots={slots}
              isLoading={isLoading}
              isFetching={isFetching}
              isError={isError}
              error={error}
              selectedSlot={selectedSlot}
              onSelectSlot={handleSelectSlot}
              onRetry={() =>
                queryClient.invalidateQueries({
                  queryKey: appointmentKeys.slotsByDate(
                    psychologist.id,
                    selectedDate?.toISOString().split("T")[0] ?? ""
                  ),
                })
              }
            />
          </CardContent>
        </Card>

        {/* Confirm panel — only mounts when a slot is selected */}
        {selectedSlot && selectedDate && (
          <ConfirmPanel
            slot={selectedSlot}
            psychologist={psychologist}
            selectedDate={selectedDate}
            isPending={checkout.isPending}
            error={checkout.error}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </div>
  )
}
