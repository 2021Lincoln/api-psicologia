/**
 * /psicologas/[id]/agendar — Server Component
 *
 * Fetches psychologist profile server-side (zero loading flicker on first paint).
 * Passes data to <BookingCalendar /> which uses React Query for all client state.
 */

import { notFound } from "next/navigation"
import { Suspense } from "react"

import { BookingCalendar } from "@/components/booking/booking-calendar"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchPsychologistProfile } from "@/lib/api/appointments"

interface Props {
  params: { id: string }
}

export default async function AgendarPage({ params }: Props) {
  const id = params?.id
  if (!id || id === "undefined") notFound()
  const psychologist = await fetchPsychologistProfile(id).catch(() => null)
  if (!psychologist) notFound()

  // TODO: read from auth session (next-auth / clerk)
  const patientEmail = "paciente@email.com"
  const appointmentId: string | undefined = undefined

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">

        <div className="mb-8 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Agendamento
          </p>
          <h1 className="text-2xl font-bold text-foreground">
            {psychologist.full_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            CRP {psychologist.crp}
            {psychologist.specialties && <> &middot; {psychologist.specialties}</>}
          </p>
        </div>

        <Suspense fallback={<CalendarSkeleton />}>
          <BookingCalendar
            psychologist={psychologist}
            patientEmail={patientEmail}
            appointmentId={appointmentId}
          />
        </Suspense>
      </div>
    </main>
  )
}

function CalendarSkeleton() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <Skeleton className="h-96 w-full lg:w-80 rounded-2xl" />
      <Skeleton className="h-96 flex-1 rounded-2xl" />
    </div>
  )
}
