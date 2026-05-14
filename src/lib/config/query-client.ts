import { QueryClient } from "@tanstack/react-query";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Default: treat data as stale after 1 minute so most queries
        // background-refetch on next mount. Individual hooks override this.
        staleTime: 60 * 1000,
        // Keep inactive query data in cache for 5 minutes before GC.
        // Reduces re-fetches when navigating back to a previously viewed page.
        gcTime: 5 * 60 * 1000,
        retry: 1,
        // Don't refetch on window focus by default — cart + orders hooks
        // that need this opt-in explicitly.
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
