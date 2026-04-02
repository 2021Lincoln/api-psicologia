"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

interface CalendarGridProps {
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
}

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function CalendarGrid({ selectedDate, onSelectDate }: CalendarGridProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewDate, setViewDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const days = useMemo(() => buildCalendarDays(viewDate), [viewDate]);

  function prevMonth() {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  function nextMonth() {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  function isSameDay(a: Date, b: Date) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  const canGoPrev =
    viewDate.getFullYear() > today.getFullYear() ||
    viewDate.getMonth() > today.getMonth();

  return (
    <div className="w-full select-none">
      {/* ── Month navigation ── */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          disabled={!canGoPrev}
          aria-label="Mês anterior"
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <span className="text-sm font-semibold text-slate-700 tracking-wide">
          {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
        </span>

        <button
          onClick={nextMonth}
          aria-label="Próximo mês"
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* ── Weekday labels ── */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-center text-xs font-medium text-slate-400 py-1"
          >
            {label}
          </div>
        ))}
      </div>

      {/* ── Day cells ── */}
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} />;
          }

          const isPast = day < today;
          const isToday = isSameDay(day, today);
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
          const isCurrentMonth = day.getMonth() === viewDate.getMonth();

          return (
            <button
              key={day.toISOString()}
              onClick={() => !isPast && onSelectDate(day)}
              disabled={isPast}
              aria-label={day.toLocaleDateString("pt-BR")}
              aria-pressed={isSelected}
              className={[
                "relative mx-auto flex h-9 w-9 items-center justify-center rounded-full",
                "text-sm font-medium transition-all duration-150 focus-visible:outline-none",
                "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1",
                isPast
                  ? "text-slate-300 cursor-not-allowed"
                  : isSelected
                  ? "bg-violet-600 text-white shadow-md scale-105"
                  : isToday
                  ? "border-2 border-violet-400 text-violet-700 hover:bg-violet-50"
                  : isCurrentMonth
                  ? "text-slate-700 hover:bg-violet-50 hover:text-violet-700 cursor-pointer"
                  : "text-slate-300 cursor-pointer hover:bg-slate-50",
              ].join(" ")}
            >
              {day.getDate()}
              {isToday && !isSelected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-violet-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- helpers ----------------------------------------------------------------

/**
 * Returns an array of 42 slots (6 weeks × 7 days).
 * Null slots fill the leading/trailing padding days.
 */
function buildCalendarDays(firstDayOfMonth: Date): (Date | null)[] {
  const year = firstDayOfMonth.getFullYear();
  const month = firstDayOfMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = Array(firstWeekday).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }

  // Pad to complete the last week
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}
