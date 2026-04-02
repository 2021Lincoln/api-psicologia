"use client";

import { Clock, Loader2, RefreshCw, Frown } from "lucide-react";
import { TimeSlot } from "@/types/booking";
import { formatSlotTime } from "@/lib/bookingApi";

interface SlotPickerProps {
  slots: TimeSlot[];
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  selectedSlot: TimeSlot | null;
  onSelectSlot: (slot: TimeSlot) => void;
  onRetry: () => void;
}

export function SlotPicker({
  slots,
  status,
  error,
  selectedSlot,
  onSelectSlot,
  onRetry,
}: SlotPickerProps) {
  // ── Idle (no date selected yet) ──────────────────────────────────────────
  if (status === "idle") {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-400">
        <Clock className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">Selecione um dia para ver os horários</p>
      </div>
    );
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Carregando horários">
        <div className="flex items-center gap-2 text-slate-400 text-xs mb-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Buscando horários disponíveis…
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-12 rounded-xl bg-slate-100 animate-pulse"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Frown className="w-9 h-9 text-rose-400" />
        <p className="text-sm text-slate-600">{error}</p>
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Tentar novamente
        </button>
      </div>
    );
  }

  // ── No slots ──────────────────────────────────────────────────────────────
  if (status === "success" && slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-400">
        <Clock className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm font-medium text-slate-500">
          Nenhum horário disponível neste dia
        </p>
        <p className="text-xs mt-1">Tente outro dia da semana</p>
      </div>
    );
  }

  // ── Slot grid ─────────────────────────────────────────────────────────────
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      role="listbox"
      aria-label="Horários disponíveis"
    >
      {slots.map((slot) => {
        const isSelected =
          selectedSlot?.start === slot.start && selectedSlot?.end === slot.end;

        return (
          <button
            key={slot.start}
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelectSlot(slot)}
            className={[
              "flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 py-3 px-2",
              "text-sm font-semibold transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
              isSelected
                ? "border-violet-600 bg-violet-600 text-white shadow-lg scale-[1.03]"
                : "border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700",
            ].join(" ")}
          >
            <span className="text-base">{formatSlotTime(slot.start)}</span>
            <span
              className={[
                "text-[10px] font-normal",
                isSelected ? "text-violet-200" : "text-slate-400",
              ].join(" ")}
            >
              {slot.duration_minutes} min
            </span>
          </button>
        );
      })}
    </div>
  );
}
