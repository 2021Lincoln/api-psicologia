import { useMutation } from "@tanstack/react-query"

import { createCheckoutSession } from "@/lib/api/appointments"

interface CheckoutPayload {
  appointment_id: string
  customer_email: string
}

/**
 * Mutation hook for creating a Stripe Checkout Session.
 *
 * On success, redirects the user to Stripe's hosted checkout page.
 * The router owns the appointment creation; this hook only handles payment.
 *
 * retry: 0 — mutations are never retried automatically because they have
 * side effects (could create duplicate checkout sessions).
 */
export function useCreateCheckout() {
  return useMutation({
    mutationFn: (payload: CheckoutPayload) => createCheckoutSession(payload),
    retry: 0,
    onSuccess: ({ checkout_url }) => {
      // Hard navigation: Stripe Checkout is an external URL
      window.location.href = checkout_url
    },
  })
}
