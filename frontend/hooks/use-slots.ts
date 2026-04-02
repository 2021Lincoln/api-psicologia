import { useQueryClient, useQuery } from "@tanstack/react-query"
import { useCallback } from "react"

import {
  appointmentKeys,
  fetchSlots,
  toDateParam,
} from "@/lib/api/appointments"
import type { TimeSlot } from "@/types/booking"

interface UseAvailableSlotsResult {
  slots: TimeSlot[]
  isLoading: boolean
  isFetching: boolean  // true on background refetch (data already shown)
  isError: boolean
  error: Error | null
  prefetchDay: (date: Date) => void  // call on hover to pre-warm the cache
}

/**
 * Fetch available time slots for a psychologist on a given date.
 *
 * TanStack Query handles:
 * - Deduplication (hovering the same day twice = 1 request)
 * - Background refetch on window focus
 * - Stale-while-revalidate (show cached slots instantly, refresh silently)
 * - Retry with exponential backoff on network errors
 */
export function useAvailableSlots(
  psychologistProfileId: string,
  selectedDate: Date | null
): UseAvailableSlotsResult {
  const queryClient = useQueryClient()

  const dateKey = selectedDate ? toDateParam(selectedDate) : ""
  const hasProfileId = Boolean(psychologistProfileId)

  const { data, isLoading, isFetching, isError, error } = useQuery<TimeSlot[], Error>({
    queryKey: appointmentKeys.slotsByDate(psychologistProfileId, dateKey),
    queryFn: () => fetchSlots(psychologistProfileId, selectedDate!),
    enabled: !!selectedDate && hasProfileId,          // skip until we have date + id
    staleTime: 30_000,                // slots stale after 30s
    gcTime: 60_000,                   // discard unused cache after 1 min
  })

  /**
   * Prefetch slots for a day the user is hovering.
   * If data is already cached and fresh, this is a no-op.
   */
  const prefetchDay = useCallback(
    (date: Date) => {
      if (!hasProfileId) return
      queryClient.prefetchQuery({
        queryKey: appointmentKeys.slotsByDate(psychologistProfileId, toDateParam(date)),
        queryFn: () => fetchSlots(psychologistProfileId, date),
        staleTime: 30_000,
      })
    },
    [psychologistProfileId, queryClient, hasProfileId]
  )

  return {
    slots: data ?? [],
    isLoading,
    isFetching,
    isError,
    error: error ?? null,
    prefetchDay,
  }
}
