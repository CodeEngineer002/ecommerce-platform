"use client";

import { create } from "zustand";

/**
 * Global navigation/loading state shared by:
 *   - the sidebar (sets navPending=true on link click)
 *   - the NavigationOverlay (renders while isNavigating is true)
 *   - apiFetch (increments apiPending around every in-flight request)
 *
 * Overlay stays visible from the moment the user clicks a sidebar item
 * through the route transition AND until every pending API call resolves
 * on the destination page. This gives a continuous "loading" experience
 * without the brief flash you'd get if the overlay tied itself to
 * pathname changes alone.
 */
interface NavLoadingState {
  navPending: boolean;
  apiPending: number;
  isNavigating: boolean;
  startNav: () => void;
  endNav: () => void;
  startApi: () => void;
  endApi: () => void;
}

export const useNavLoadingStore = create<NavLoadingState>((set) => ({
  navPending:  false,
  apiPending:  0,
  isNavigating: false,
  startNav: () =>
    set(() => ({ navPending: true, isNavigating: true })),
  endNav: () =>
    set((s) => ({
      navPending:   false,
      isNavigating: s.apiPending > 0,
    })),
  startApi: () =>
    set((s) => ({
      apiPending:   s.apiPending + 1,
      isNavigating: true,
    })),
  endApi: () =>
    set((s) => {
      const next = Math.max(0, s.apiPending - 1);
      return {
        apiPending:   next,
        isNavigating: next > 0 || s.navPending,
      };
    }),
}));
