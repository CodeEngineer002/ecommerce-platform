"use client";

import { useEffect, useRef, useState } from "react";

import { Label } from "@/components/ui/label";

export interface CountryPhoneConfig {
  dialCode: string;
  flag: string;
  placeholder: string;
  maxDigits: number;
}

export const COUNTRY_PHONE_CONFIG: Record<string, CountryPhoneConfig> = {
  US: { dialCode: "+1",   flag: "🇺🇸", placeholder: "(555) 555-5555",  maxDigits: 10 },
  IN: { dialCode: "+91",  flag: "🇮🇳", placeholder: "98765 43210",      maxDigits: 10 },
  DE: { dialCode: "+49",  flag: "🇩🇪", placeholder: "0151 23456789",    maxDigits: 11 },
  GB: { dialCode: "+44",  flag: "🇬🇧", placeholder: "07700 900123",     maxDigits: 11 },
  FR: { dialCode: "+33",  flag: "🇫🇷", placeholder: "06 12 34 56 78",   maxDigits: 10 },
  IT: { dialCode: "+39",  flag: "🇮🇹", placeholder: "312 345 6789",     maxDigits: 10 },
  ES: { dialCode: "+34",  flag: "🇪🇸", placeholder: "612 345 678",      maxDigits: 9  },
  AE: { dialCode: "+971", flag: "🇦🇪", placeholder: "50 123 4567",      maxDigits: 9  },
};

const DEFAULT_CONFIG: CountryPhoneConfig = {
  dialCode: "+",
  flag: "🌐",
  placeholder: "Phone number",
  maxDigits: 15,
};

function formatPhone(digits: string, country: string): string {
  switch (country) {
    case "US": {
      const d = digits.slice(0, 10);
      if (d.length <= 3) return d;
      if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
      return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    }
    case "IN": {
      const d = digits.slice(0, 10);
      if (d.length <= 5) return d;
      return `${d.slice(0, 5)} ${d.slice(5)}`;
    }
    case "DE": {
      const d = digits.slice(0, 11);
      if (d.length <= 4) return d;
      return `${d.slice(0, 4)} ${d.slice(4)}`;
    }
    case "GB": {
      const d = digits.slice(0, 11);
      if (d.length <= 5) return d;
      return `${d.slice(0, 5)} ${d.slice(5)}`;
    }
    case "FR": {
      const d = digits.slice(0, 10);
      return d.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
    }
    case "IT": {
      const d = digits.slice(0, 10);
      if (d.length <= 3) return d;
      if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
      return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
    }
    case "ES": {
      const d = digits.slice(0, 9);
      if (d.length <= 3) return d;
      if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
      return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
    }
    case "AE": {
      const d = digits.slice(0, 9);
      if (d.length <= 2) return d;
      if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
      return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
    }
    default:
      return digits;
  }
}

const PHONE_RULES: Record<string, { min: number; max: number; hint: string }> = {
  US: { min: 10, max: 10, hint: "Enter 10 digits, e.g. (555) 555-5555" },
  IN: { min: 10, max: 10, hint: "Enter 10 digits, e.g. 98765 43210" },
  DE: { min: 9,  max: 11, hint: "Enter 9\u201311 digits, e.g. 0151 23456789" },
  GB: { min: 10, max: 11, hint: "Enter 10\u201311 digits, e.g. 07700 900123" },
  FR: { min: 10, max: 10, hint: "Enter 10 digits, e.g. 06 12 34 56 78" },
  IT: { min: 9,  max: 10, hint: "Enter 9\u201310 digits, e.g. 312 345 6789" },
  ES: { min: 9,  max: 9,  hint: "Enter 9 digits, e.g. 612 345 678" },
  AE: { min: 9,  max: 9,  hint: "Enter 9 digits, e.g. 50 123 4567" },
};

function validatePhone(digits: string, country: string): string | null {
  if (!digits) return null;
  const rule = PHONE_RULES[country];
  if (!rule) return null;
  if (digits.length < rule.min || digits.length > rule.max) return rule.hint;
  return null;
}

function extractLocal(v: string, dialCode: string): string {
  const prefix = dialCode + " ";
  if (v.startsWith(prefix)) return v.slice(prefix.length);
  if (v.startsWith(dialCode)) return v.slice(dialCode.length).trimStart();
  return v;
}

interface PhoneFieldProps {
  countryCode: string;
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  id?: string;
  name?: string;
}

export function PhoneField({
  countryCode,
  value = "",
  onChange,
  onBlur,
  error,
  id = "phone",
  name,
}: PhoneFieldProps) {
  const config = COUNTRY_PHONE_CONFIG[countryCode] ?? DEFAULT_CONFIG;
  const [display, setDisplay] = useState(() => extractLocal(value, config.dialCode));
  const [inlineError, setInlineError] = useState<string | null>(null);
  const isFocused = useRef(false);
  const prevCountry = useRef(countryCode);

  useEffect(() => {
    if (prevCountry.current !== countryCode) {
      setDisplay("");
      setInlineError(null);
      prevCountry.current = countryCode;
    }
  }, [countryCode]);

  useEffect(() => {
    if (!isFocused.current) {
      setDisplay(extractLocal(value, config.dialCode));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setDisplay(raw);
    setInlineError(null);
    onChange?.(raw ? `${config.dialCode} ${raw}` : "");
  }

  function handleFocus() {
    isFocused.current = true;
    // Strip formatting so user edits clean digits only
    const rawDigits = display.replace(/\D/g, "");
    setDisplay(rawDigits);
  }

  function handleBlur() {
    isFocused.current = false;
    // Truncate to max allowed digits FIRST — prevents silent drop + false error
    const digits = display.replace(/\D/g, "").slice(0, config.maxDigits);
    if (digits) {
      const formatted = formatPhone(digits, countryCode);
      setDisplay(formatted);
      onChange?.(`${config.dialCode} ${formatted}`);
      setInlineError(validatePhone(digits, countryCode));
    } else {
      onChange?.("");
      setInlineError(null);
    }
    onBlur?.();
  }

  const shownError = error ?? inlineError;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        Phone{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
      </Label>

      <div
        className={`flex h-9 w-full overflow-hidden rounded-md border shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring ${
          shownError
            ? "border-destructive focus-within:ring-destructive"
            : "border-input"
        }`}
      >
        <div className="flex shrink-0 select-none items-center gap-1.5 border-r border-input bg-muted px-3 text-sm text-muted-foreground">
          <span aria-hidden="true" className="text-base leading-none">{config.flag}</span>
          <span className="font-mono">{config.dialCode}</span>
        </div>

        <input
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={display}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={config.placeholder}
          maxLength={config.maxDigits}
          aria-describedby={shownError ? `${id}-error` : undefined}
          aria-invalid={!!shownError}
          className="flex-1 bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {shownError && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {shownError}
        </p>
      )}
    </div>
  );
}
