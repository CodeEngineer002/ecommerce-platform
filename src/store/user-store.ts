/**
 * Global user store (Zustand).
 *
 * Populated once on app mount from the server-side session via UserHydrationProvider.
 * Updated on profile mutations. Cleared on sign-out.
 *
 * Purpose: avoid repeating useProfile() API calls across components
 * (Navbar, Checkout, Profile page, etc.) that just need name/avatar/role.
 *
 * NOT persisted to localStorage — always hydrated from the server session on
 * page load so it never goes stale between visits.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface UserInfo {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role?: string | null;
}

interface UserState {
  /** Null until hydrated (user is a guest or not yet mounted) */
  user: UserInfo | null;
  /** True after UserHydrationProvider has run — prevents flash of unauthenticated UI */
  isHydrated: boolean;

  setUser: (user: UserInfo | null) => void;
  /** Partial update — merges into existing user without requiring all fields */
  patchUser: (patch: Partial<UserInfo>) => void;
  clearUser: () => void;
  _setHydrated: () => void;
}

export const useUserStore = create<UserState>()(
  devtools(
    (set, get) => ({
      user: null,
      isHydrated: false,

      setUser: (user) => set({ user }, false, "setUser"),

      patchUser: (patch) => {
        const current = get().user;
        if (!current) return;
        set({ user: { ...current, ...patch } }, false, "patchUser");
      },

      clearUser: () => set({ user: null }, false, "clearUser"),

      _setHydrated: () => set({ isHydrated: true }, false, "_setHydrated"),
    }),
    { name: "ShopNest/user" },
  ),
);
