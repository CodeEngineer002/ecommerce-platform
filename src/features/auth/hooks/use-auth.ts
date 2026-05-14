"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";

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

export const authKeys = {
  profile: ["auth", "profile"] as const,
};

export function useProfile() {
  return useQuery({
    queryKey: authKeys.profile,
    queryFn: getProfile,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LoginFormData) => signIn(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.profile });
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

  return useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.clear();
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.profile });
      toast.success("Profile updated");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
