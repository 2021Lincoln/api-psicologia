import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 30s — avoids redundant refetches on tab focus
      staleTime: 30_000,
      // Keep unused data in cache for 5 min (good for back-navigation UX)
      gcTime: 5 * 60_000,
      // Retry failed requests twice with exponential backoff
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      // Refetch when window regains focus (user switches tabs and comes back)
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0, // Never retry mutations — side effects are not idempotent
    },
  },
})
