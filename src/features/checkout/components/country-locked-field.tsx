"use client";

import { Lock } from "lucide-react";

import { Label } from "@/components/ui/label";

interface CountryLockedFieldProps {
  countryCode: string;
  id?: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  IN: "India",
  DE: "Germany",
  GB: "United Kingdom",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  AE: "United Arab Emirates",
};

/**
 * Displays the active storefront country as a read-only locked field.
 * Explains to the user why it cannot be changed.
 */
export function CountryLockedField({ countryCode, id = "shipping-country" }: CountryLockedFieldProps) {
  const countryName = COUNTRY_NAMES[countryCode] ?? countryCode;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        Country <span className="ml-1 text-destructive" aria-hidden="true">*</span>
      </Label>
      <div
        id={id}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground"
        aria-label={`Country: ${countryName} (locked)`}
      >
        <span>{countryName} ({countryCode})</span>
        <Lock className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
      </div>
      <p className="text-xs text-muted-foreground">
        Shipping country is set by your selected store region.
      </p>
    </div>
  );
}
