"use client";

import { FormField } from "@/components/common/form-field";

interface PostalCodeFieldProps {
  label?: string;
  placeholder?: string;
  error?: string | { message?: string };
  required?: boolean;
  // Allow all standard input attributes to be spread
  [key: string]: unknown;
}

/**
 * Country-aware postal code field.
 * Label + placeholder are driven by country rules (pass from useLocationRules).
 */
export function PostalCodeField({
  label = "Postal Code",
  placeholder,
  error,
  required,
  ...rest
}: PostalCodeFieldProps) {
  return (
    <FormField
      label={label}
      placeholder={placeholder ?? `Enter ${label}`}
      required={required}
      error={typeof error === "string" ? error : error?.message}
      {...rest}
    />
  );
}
