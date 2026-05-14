"use client";

import { Loader2, Search, X } from "lucide-react";
import * as React from "react";

import { Label } from "@/components/ui/label";
import { useCitySearch } from "@/features/checkout/hooks/use-locations";
import { cn } from "@/lib/utils";

interface CitySearchSelectProps {
  countryCode: string;
  regionCode: string;
  value: string;
  onChange: (city: string) => void;
  allowFreeText?: boolean;
  label?: string;
  error?: string;
  required?: boolean;
  id?: string;
  disabled?: boolean;
}

/**
 * Async searchable city field.
 * - Debounced API search via /api/locations/cities
 * - Disabled until a region is selected
 * - Resets when region changes
 * - allowFreeText=true: user can type any value (used for countries with fewer DB cities)
 * - allowFreeText=false: user must pick from dropdown
 */
export function CitySearchSelect({
  countryCode,
  regionCode,
  value,
  onChange,
  allowFreeText = true,
  label = "City",
  error,
  required,
  id = "city",
  disabled = false,
}: CitySearchSelectProps) {
  const [inputValue, setInputValue] = React.useState(value);
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Reset input when region changes
  const prevRegionRef = React.useRef(regionCode);
  React.useEffect(() => {
    if (prevRegionRef.current !== regionCode) {
      setInputValue("");
      onChange("");
      prevRegionRef.current = regionCode;
    }
  }, [regionCode, onChange]);

  // Sync controlled value
  React.useEffect(() => {
    if (value !== inputValue && !open) {
      setInputValue(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const { data: cities = [], isFetching } = useCitySearch(
    countryCode,
    regionCode,
    inputValue,
  );

  const isDisabled = disabled || !regionCode;

  // Close on outside click
  React.useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // If free text not allowed and value doesn't match a city, clear it
        if (!allowFreeText && inputValue && !cities.some((c) => c.name === inputValue)) {
          setInputValue("");
          onChange("");
        }
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [allowFreeText, cities, inputValue, onChange]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value);
    setOpen(true);
    if (allowFreeText) onChange(e.target.value);
    else onChange("");
  }

  function handleSelect(cityName: string) {
    setInputValue(cityName);
    onChange(cityName);
    setOpen(false);
  }

  function handleClear() {
    setInputValue("");
    onChange("");
  }

  const showDropdown = open && !!regionCode && (cities.length > 0 || isFetching);

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}
      </Label>

      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {isFetching && regionCode ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
        </div>
        <input
          id={id}
          type="text"
          autoComplete="off"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => regionCode && setOpen(true)}
          disabled={isDisabled}
          placeholder={
            !regionCode
              ? "Select a state / province first"
              : `Search ${label}…`
          }
          aria-required={required}
          aria-autocomplete="list"
          className={cn(
            "flex h-9 w-full rounded-md border bg-background py-1 pl-9 pr-8 text-sm shadow-sm transition-colors",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-1 focus:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error ? "border-destructive" : "border-input",
          )}
        />
        {inputValue && !isDisabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear city"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <ul
          role="listbox"
          className="absolute z-50 mt-0 max-h-52 w-full overflow-y-auto rounded-md border border-input bg-popover py-1 shadow-md"
        >
          {isFetching && cities.length === 0 ? (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </li>
          ) : cities.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No cities found.</li>
          ) : (
            cities.map((city) => (
              <li
                key={city.id}
                role="option"
                aria-selected={city.name === value}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(city.name); }}
                className={cn(
                  "cursor-pointer px-3 py-1.5 text-sm hover:bg-accent",
                  city.name === value && "font-medium bg-accent/50",
                )}
              >
                {city.name}
              </li>
            ))
          )}
        </ul>
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      )}
    </div>
  );
}
