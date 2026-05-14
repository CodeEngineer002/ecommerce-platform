"use client";

/**
 * React Query hooks for the address domain.
 *
 * All mutations optimistically update the local query cache and
 * invalidate on success/error to re-sync with the server.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import type { AddressInput, AddressCountryRules, CustomerAddress } from "@/domain/address/types";
import { queryKeys } from "@/lib/query-keys";
import { useUserStore } from "@/store/user-store";

// ── Fetch helpers ─────────────────────────────────────────────────────────────

interface AddressListResponse {
  addresses: CustomerAddress[];
  countryRules: AddressCountryRules[];
}

async function fetchAddresses(): Promise<AddressListResponse> {
  const res = await fetch("/api/addresses");
  if (!res.ok) {
    const { error } = (await res.json()) as { error?: { message?: string } };
    throw new Error(error?.message ?? "Failed to load addresses");
  }
  const { data } = (await res.json()) as { data: AddressListResponse };
  return data;
}

async function createAddressApi(input: AddressInput): Promise<CustomerAddress> {
  const res = await fetch("/api/addresses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: { message?: string; fields?: Record<string, string[]> } };
    const err: Error & { fields?: Record<string, string[]> } = new Error(
      body.error?.message ?? "Failed to create address",
    );
    err.fields = body.error?.fields;
    throw err;
  }
  const { data } = (await res.json()) as { data: CustomerAddress };
  return data;
}

async function updateAddressApi(
  id: string,
  patch: Partial<AddressInput>,
): Promise<CustomerAddress> {
  const res = await fetch(`/api/addresses/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to update address");
  }
  const { data } = (await res.json()) as { data: CustomerAddress };
  return data;
}

async function archiveAddressApi(id: string): Promise<void> {
  const res = await fetch(`/api/addresses/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json()) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to delete address");
  }
}

async function setDefaultApi(
  id: string,
  type: "shipping" | "billing",
): Promise<CustomerAddress> {
  const res = await fetch(`/api/addresses/${id}/default-${type}`, {
    method: "PATCH",
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Failed to set default ${type} address`);
  }
  const { data } = (await res.json()) as { data: CustomerAddress };
  return data;
}

// ── useAddresses ─────────────────────────────────────────────────────────────

/**
 * Fetches the user's active address book + country rules.
 * Only runs when the user is authenticated.
 */
export function useAddresses(): UseQueryResult<AddressListResponse> {
  const userId = useUserStore((s) => s.user?.id);

  return useQuery({
    queryKey: queryKeys.addresses.list(userId ?? ""),
    queryFn: fetchAddresses,
    enabled: !!userId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

// ── useCreateAddress ──────────────────────────────────────────────────────────

export function useCreateAddress(): UseMutationResult<CustomerAddress, Error, AddressInput> {
  const queryClient = useQueryClient();
  const userId = useUserStore.getState().user?.id ?? "";

  return useMutation({
    mutationFn: createAddressApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.addresses.list(userId) });
    },
  });
}

// ── useUpdateAddress ──────────────────────────────────────────────────────────

interface UpdateAddressVars {
  id: string;
  patch: Partial<AddressInput>;
}

export function useUpdateAddress(): UseMutationResult<CustomerAddress, Error, UpdateAddressVars> {
  const queryClient = useQueryClient();
  const userId = useUserStore.getState().user?.id ?? "";

  return useMutation({
    mutationFn: ({ id, patch }) => updateAddressApi(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.addresses.list(userId) });
    },
  });
}

// ── useArchiveAddress ─────────────────────────────────────────────────────────

export function useArchiveAddress(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  const userId = useUserStore.getState().user?.id ?? "";

  return useMutation({
    mutationFn: archiveAddressApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.addresses.list(userId) });
    },
  });
}

// ── useSetDefaultShipping ─────────────────────────────────────────────────────

export function useSetDefaultShipping(): UseMutationResult<CustomerAddress, Error, string> {
  const queryClient = useQueryClient();
  const userId = useUserStore.getState().user?.id ?? "";

  return useMutation({
    mutationFn: (id) => setDefaultApi(id, "shipping"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.addresses.list(userId) });
    },
  });
}

// ── useSetDefaultBilling ──────────────────────────────────────────────────────

export function useSetDefaultBilling(): UseMutationResult<CustomerAddress, Error, string> {
  const queryClient = useQueryClient();
  const userId = useUserStore.getState().user?.id ?? "";

  return useMutation({
    mutationFn: (id) => setDefaultApi(id, "billing"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.addresses.list(userId) });
    },
  });
}
