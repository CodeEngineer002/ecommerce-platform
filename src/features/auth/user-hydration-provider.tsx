/**
 * UserHydrationProvider
 *
 * A lightweight client component that syncs the server-resolved user
 * (passed from the RSC layout) into the Zustand user store.
 *
 * WHY: The server layout already fetches the profile from Supabase —
 * this component reuses that result instead of making a second API call
 * from the client. Components that need user info (Checkout, Profile,
 * Account pages) read from useUserStore() — zero extra fetches.
 *
 * FLOW:
 *   Server layout (RSC) → getProfile() → passes user prop
 *   ↓
 *   UserHydrationProvider mounts → setUser(user) in Zustand
 *   ↓
 *   Any client component: const { user } = useUserStore()
 */

"use client";

import { useEffect } from "react";

import { useUserStore, type UserInfo } from "@/store/user-store";

interface Props {
  user: Pick<UserInfo, "id" | "email" | "full_name" | "avatar_url"> | null;
  children: React.ReactNode;
}

export function UserHydrationProvider({ user, children }: Props) {
  const setUser = useUserStore((s) => s.setUser);
  const clearUser = useUserStore((s) => s.clearUser);
  const _setHydrated = useUserStore((s) => s._setHydrated);

  useEffect(() => {
    if (user) {
      setUser({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
      });
    } else {
      clearUser();
    }
    _setHydrated();
    // Only run when the server-resolved identity changes (i.e., login/logout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return <>{children}</>;
}
