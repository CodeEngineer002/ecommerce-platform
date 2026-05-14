"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidateAddressInput {
  full_name: string;
  phone?: string | null;
  address_line1: string;
  address_line2?: string | null;
  country_code: string;
  region_code: string;
  city: string;
  postal_code: string;
}

export interface NormalizedAddress {
  full_name: string;
  city: string;
  region_code: string;
  state: string;
  postal_code: string;
  country_code: string;
}

export interface AddressValidationResult {
  is_valid: boolean;
  normalized?: NormalizedAddress;
  warnings: string[];
  confidence_score: number;
}

// ── useAddressValidation ──────────────────────────────────────────────────────

export function useAddressValidation() {
  const [lastResult, setLastResult] = useState<AddressValidationResult | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const mutation = useMutation<
    AddressValidationResult,
    Error,
    ValidateAddressInput
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/address/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      const json = await res.json() as {
        data?: AddressValidationResult;
        error?: string;
        details?: Record<string, string[]>;
      };

      if (!res.ok) {
        setFieldErrors(json.details ?? {});
        throw new Error(json.error ?? "Address validation failed");
      }

      setFieldErrors({});
      return json.data!;
    },
    onSuccess: (result) => {
      setLastResult(result);
      setFieldErrors({});
    },
    onError: () => {
      setLastResult(null);
    },
  });

  function reset() {
    setLastResult(null);
    setFieldErrors({});
    mutation.reset();
  }

  return {
    validate: mutation.mutateAsync,
    isValidating: mutation.isPending,
    lastResult,
    fieldErrors,
    isValid: lastResult?.is_valid === true,
    warnings: lastResult?.warnings ?? [],
    normalized: lastResult?.normalized,
    reset,
  };
}
