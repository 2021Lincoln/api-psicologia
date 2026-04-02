export interface TimeSlot {
  start: string;   // ISO 8601 UTC — "2026-03-11T09:00:00"
  end: string;
  duration_minutes: number;
  status: "available" | "reserved";
}

export interface PsychologistProfile {
  id: string;
  full_name: string;
  crp: string;
  hourly_rate: string;   // Decimal as string from API
  session_duration_minutes: number;
  specialties: string | null;
  bio: string | null;
}

export interface CheckoutResponse {
  checkout_url: string;
  session_id: string;
}

export interface Availability {
  id: string;
  psychologist_profile_id: string;
  week_day: number;
  start_time: string; // "09:00:00"
  end_time: string;   // "12:00:00"
  is_active: boolean;
}

export interface Appointment {
  id: string;
  patient_id: string;
  psychologist_profile_id: string;
  scheduled_at: string;
  duration_minutes: number;
  price: string;
  status: "pending" | "paid" | "cancelled";
  daily_room_url?: string | null;
}
