"use client"

import { AlertCircle, Clock, RefreshCw } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatSlotTime } from "@/lib/api/appointments"
import type { TimeSlot } from "@/types/booking"

interface SlotPickerProps {
  slots: TimeSlot[]
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  selectedSlot: TimeSlot | null
  onSelectSlot: (slot: TimeSlot) => void
  onRetry: () => void
}

export function SlotPicker({
  slots,
  isLoading,
  isFetching,
  isError,
  error,
  selectedSlot,
  onSelectSlot,
  onRetry,
}: SlotPickerProps) {

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (!isLoading && !isError && slots.length === 0 && !isFetching) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
        <Clock className="h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">Selecione um dia para ver os horários</p>
      </div>
    )
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-14 w-full rounded-xl"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <Alert variant="error" className="flex-col items-center text-center gap-2">
        <AlertCircle className="h-5 w-5" />
        <AlertDescription className="mt-1">
          {error?.message ?? "Erro ao buscar horários."}
        </AlertDescription>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-2 gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Tentar novamente
        </Button>
      </Alert>
    )
  }

  // ── Empty ─────────────────────────────────────────────────────────────────
  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
        <Clock className="h-10 w-10 opacity-30" />
        <p className="text-sm font-medium text-foreground">Nenhum horário disponível</p>
        <p className="text-xs">Tente selecionar outro dia</p>
      </div>
    )
  }

  // ── Slot grid ──────────────────────────────────────────────────────────────
  return (
    <div
      role="listbox"
      aria-label="Horários disponíveis"
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-3 transition-opacity duration-200",
        isFetching && "opacity-60 pointer-events-none"
      )}
    >
      {slots.map((slot) => {
        const isReserved = slot.status === "reserved"
        const isSelected =
          !isReserved && selectedSlot?.start === slot.start && selectedSlot?.end === slot.end

        if (isReserved) {
          return (
            <div
              key={slot.start}
              aria-disabled="true"
              title="Horário já reservado"
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 py-3 px-2
                border-border/30 bg-muted/20 opacity-50 cursor-not-allowed select-none"
            >
              <span className="text-base font-semibold text-muted-foreground line-through">
                {formatSlotTime(slot.start)}
              </span>
              <span className="text-[10px] font-medium text-muted-foreground/60">
                Reservado
              </span>
            </div>
          )
        }

        return (
          <button
            key={slot.start}
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelectSlot(slot)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 py-3 px-2",
              "text-sm font-semibold transition-all duration-150 cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              isSelected
                ? "border-primary bg-primary text-primary-foreground shadow-md scale-[1.03]"
                : "border-border bg-card text-card-foreground hover:border-primary/50 hover:bg-accent"
            )}
          >
            <span className="text-base">{formatSlotTime(slot.start)}</span>
            <span
              className={cn(
                "text-[10px] font-normal",
                isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
              )}
            >
              {slot.duration_minutes} min
            </span>
          </button>
        )
      })}
    </div>
  )
}
