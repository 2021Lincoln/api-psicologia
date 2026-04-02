import { useCallback, useEffect, useState } from "react";
import { fetchAvailableSlots } from "@/lib/bookingApi";
import { TimeSlot } from "@/types/booking";

type Status = "idle" | "loading" | "success" | "error";

interface UseAvailableSlotsResult {
  slots: TimeSlot[];
  status: Status;
  error: string | null;
  refetch: () => void;
}

export function useAvailableSlots(
  psychologistProfileId: string,
  selectedDate: Date | null
): UseAvailableSlotsResult {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedDate || !psychologistProfileId) return;

    setStatus("loading");
    setError(null);

    try {
      const data = await fetchAvailableSlots(psychologistProfileId, selectedDate);
      setSlots(data);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar horários.");
      setStatus("error");
    }
  }, [psychologistProfileId, selectedDate]);

  useEffect(() => {
    setSlots([]);
    load();
  }, [load]);

  return { slots, status, error, refetch: load };
}
