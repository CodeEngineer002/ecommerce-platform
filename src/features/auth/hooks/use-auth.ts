"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";

import { queryKeys } from "@/lib/query-keys";
import { useCartStore } from "@/store/cart-store";
import { useUserStore } from "@/store/user-store";
import type { LoginFormData, RegisterFormData } from "@/lib/validators";
import type { Profile } from "@/types";

import {
  getProfile,
  resetPassword,
  signIn,
  signOut,
  signUp,
  updateProfile,
} from "../services/auth.service";

// Re-exported for backward compat — profile-form.tsx imports this
export const authKeys = queryKeys.auth;

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.auth.profile,
    queryFn: getProfile,
    // 5 min: profile rarely changes; UserHydrationProvider already seeds the store
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LoginFormData) => signIn(data),
    onSuccess: async () => {
      // Merge guest cart → user cart (fire-and-forget; errors are non-fatal)
      try {
        await fetch("/api/cart/merge", { method: "POST" });
      } catch {
        // merge failure must not block login redirect
      }

      // Invalidate profile + cart so fresh data is fetched after redirect
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.profile });
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.session });

      const redirectTo = searchParams.get("redirect") ?? "/";
      router.push(redirectTo);
      toast.success("Welcome back!");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useSignUp() {
  const router = useRouter();

  return useMutation({
    mutationFn: (data: RegisterFormData) => signUp(data),
    onSuccess: () => {
      router.push("/login?verified=1");
      toast.success("Account created! Please check your email to verify.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const clearCart = useCartStore((s) => s.clearCart);

  return useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      // Clear all cached server data
      queryClient.clear();
      // Clear client-side stores
      useUserStore.getState().clearUser();
      clearCart();
      router.push("/");
      toast.success("Signed out successfully");
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (email: string) => resetPassword(email),
    onSuccess: () => {
      toast.success("Password reset email sent");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      updates,
    }: {
      userId: string;
      updates: Partial<Pick<Profile, "full_name" | "phone" | "avatar_url">>;
    }) => updateProfile(userId, updates),
    onSuccess: (_, { updates }) => {
      // Invalidate the React Query cache for full re-fetch
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.profile });
      // Also patch user store immediately so UI updates without waiting for refetch
      useUserStore.getState().patchUser({
        full_name: updates.full_name ?? undefined,
        avatar_url: updates.avatar_url ?? undefined,
      });
      toast.success("Profile updated");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
