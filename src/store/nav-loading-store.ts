"use client";

import { create } from "zustand";

interface NavLoadingState {
  isNavigating: boolean;
  start: () => void;
  stop: () => void;
}

/**
 * Global navigation loading state.
 * Set start() before router.push(); the NavigationOverlay auto-clears
 * on pathname change (navigation complete).
 */
export const useNavLoadingStore = create<NavLoadingState>((set) => ({
  isNavigating: false,
  start: () => set({ isNavigating: true }),
  stop: () => set({ isNavigating: false }),
}));
