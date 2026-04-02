"use client"

import { CreditCard, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { formatPrice, formatSlotTime } from "@/lib/api/appointments"
import type { PsychologistProfile, TimeSlot } from "@/types/booking"

interface ConfirmPanelProps {
  slot: TimeSlot
  psychologist: PsychologistProfile
  selectedDate: Date
  isPending: boolean
  error: Error | null
  onConfirm: () => void
}

export function ConfirmPanel({
  slot,
  psychologist,
  selectedDate,
  isPending,
  error,
  onConfirm,
}: ConfirmPanelProps) {
  const formattedDate = selectedDate.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  const price = formatPrice(psychologist.hourly_rate, psychologist.session_duration_minutes)

  return (
    <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-5 space-y-4">

      {/* ── Summary ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Sessão selecionada
          </p>
          <p className="text-lg font-bold text-foreground">
            {formatSlotTime(slot.start)}
            <span className="text-muted-foreground font-normal mx-1.5">–</span>
            {formatSlotTime(slot.end)}
          </p>
          <p className="text-xs text-muted-foreground capitalize">
            {formattedDate} &middot; {slot.duration_minutes} min
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Valor
          </p>
          <p className="text-2xl font-bold text-foreground">{price}</p>
        </div>
      </div>

      <Separator className="bg-primary/10" />

      {/* ── Psychologist info ── */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center
                        text-sm font-bold text-primary shrink-0">
          {psychologist.full_name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {psychologist.full_name}
          </p>
          <Badge variant="secondary" className="text-[10px] h-4 mt-0.5">
            CRP {psychologist.crp}
          </Badge>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error.message}</AlertDescription>
        </Alert>
      )}

      {/* ── CTA ── */}
      <Button
        onClick={onConfirm}
        disabled={isPending}
        size="lg"
        className="w-full gap-2 font-bold tracking-wide"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Redirecionando para o pagamento…
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4" />
            Confirmar e Pagar
          </>
        )}
      </Button>

      <p className="text-center text-[11px] text-muted-foreground">
        Pagamento seguro via Stripe · Cancele com 24h de antecedência
      </p>
    </div>
  )
}
