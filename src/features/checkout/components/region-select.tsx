"use client";

import { Label } from "@/components/ui/label";
import { useRegions } from "@/features/checkout/hooks/use-locations";
import { SearchableSelect } from "./searchable-select";

interface RegionSelectProps {
  countryCode: string;
  value: string;
  onChange: (code: string) => void;
  label?: string;
  error?: string;
  required?: boolean;
  id?: string;
  disabled?: boolean;
}

/**
 * Searchable dropdown for state/province/emirate, loaded from the DB.
 * Label changes based on country rules (e.g. "Emirate" for AE).
 */
export function RegionSelect({
  countryCode,
  value,
  onChange,
  label = "State / Province",
  error,
  required,
  id = "region-code",
  disabled = false,
}: RegionSelectProps) {
  const { data: regions = [], isLoading } = useRegions(countryCode);

  const options = regions.map((r) => ({ value: r.code, label: r.name }));

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}
      </Label>
      <SearchableSelect
        id={id}
        options={options}
        value={value}
        onChange={onChange}
        placeholder={`Select ${label}…`}
        searchPlaceholder={`Search ${label}…`}
        isLoading={isLoading}
        disabled={disabled}
        error={error}
        aria-required={required}
      />
      {error && (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      )}
    </div>
  );
}
