"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface CalendarGridProps {
  selectedDate: Date | null
  onSelectDate: (date: Date) => void
  onHoverDate?: (date: Date) => void   // used to prefetch slots on hover
}

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export function CalendarGrid({
  selectedDate,
  onSelectDate,
  onHoverDate,
}: CalendarGridProps) {
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const [viewDate, setViewDate] = useState<Date>(() => {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  })

  const days = useMemo(() => buildCalendarDays(viewDate), [viewDate])

  const canGoPrev =
    viewDate.getFullYear() > today.getFullYear() ||
    viewDate.getMonth() > today.getMonth()

  function isSameDay(a: Date, b: Date) {
    return (
      a.getDate() === b.getDate() &&
      a.getMonth() === b.getMonth() &&
      a.getFullYear() === b.getFullYear()
    )
  }

  return (
    <div className="w-full select-none">

      {/* ── Month navigation ── */}
      <div className="flex items-center justify-between mb-5">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          disabled={!canGoPrev}
          aria-label="Mês anterior"
          className="h-8 w-8 text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <span className="text-sm font-semibold text-foreground">
          {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
        </span>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          aria-label="Próximo mês"
          className="h-8 w-8 text-muted-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Weekday labels ── */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-center text-[11px] font-medium text-muted-foreground py-1"
          >
            {label}
          </div>
        ))}
      </div>

      {/* ── Day cells ── */}
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />

          const isPast = day < today
          const isToday = isSameDay(day, today)
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
          const isCurrentMonth = day.getMonth() === viewDate.getMonth()

          return (
            <button
              key={day.toISOString()}
              onClick={() => !isPast && onSelectDate(day)}
              onMouseEnter={() => !isPast && onHoverDate?.(day)}
              disabled={isPast}
              aria-label={day.toLocaleDateString("pt-BR")}
              aria-pressed={isSelected}
              className={cn(
                "relative mx-auto flex h-9 w-9 items-center justify-center rounded-full",
                "text-sm font-medium transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                isPast && "text-muted-foreground/30 cursor-not-allowed",
                !isPast && isSelected && "bg-primary text-primary-foreground shadow-md scale-105",
                !isPast && !isSelected && isToday && "border-2 border-primary text-primary hover:bg-primary/10",
                !isPast && !isSelected && !isToday && isCurrentMonth && "text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer",
                !isPast && !isSelected && !isToday && !isCurrentMonth && "text-muted-foreground/50 cursor-pointer hover:bg-muted",
              )}
            >
              {day.getDate()}
              {/* Today indicator dot */}
              {isToday && !isSelected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCalendarDays(firstDayOfMonth: Date): (Date | null)[] {
  const year = firstDayOfMonth.getFullYear()
  const month = firstDayOfMonth.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (Date | null)[] = Array(firstWeekday).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}
