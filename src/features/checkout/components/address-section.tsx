"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { Control, FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { Controller } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocationRules } from "@/features/checkout/hooks/use-locations";
import type { CheckoutFormData } from "@/lib/validators";
import { CitySearchSelect } from "./city-search-select";
import { CountryLockedField } from "./country-locked-field";
import { PostalCodeField } from "./postal-code-field";
import { RegionSelect } from "./region-select";

interface AddressSectionProps {
  title: string;
  prefix: "shippingAddress" | "billingAddress";
  countryCode: string;
  control: Control<CheckoutFormData>;
  register: UseFormRegister<CheckoutFormData>;
  errors: FieldErrors<CheckoutFormData>;
  setValue: UseFormSetValue<CheckoutFormData>;
  watch: UseFormWatch<CheckoutFormData>;
  /** Validation result warnings to display inline */
  warnings?: string[];
  /** Whether this address has been server-validated */
  isValidated?: boolean;
}

export function AddressSection({
  title,
  prefix,
  countryCode,
  control,
  register,
  errors,
  setValue,
  watch,
  warnings = [],
  isValidated = false,
}: AddressSectionProps) {
  const addr = errors[prefix] as Record<string, { message?: string }> | undefined;
  const fieldError = (key: string): string | undefined => addr?.[key]?.message;

  const { data: rules } = useLocationRules(countryCode);

  // Watch the region_code for this address so city select can depend on it
  const regionCode = watch(`${prefix}.region_code` as "shippingAddress.region_code" | "billingAddress.region_code") ?? "";

  const stateLabel      = rules?.state_label      ?? "State / Province";
  const cityLabel       = rules?.city_label        ?? "City";
  const postalLabel     = rules?.postal_code_label ?? "Postal Code";
  const postalExample   = rules?.postal_code_example ?? undefined;
  const allowFreeCity   = rules?.allows_free_text_city ?? true;
  const phoneRequired   = rules?.phone_required ?? false;
  const stateRequired   = rules?.state_required ?? true;
  const cityRequired    = rules?.city_required ?? true;
  const postalRequired  = rules?.postal_code_required ?? true;

  return (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          {isValidated && (
            <span className="flex items-center gap-1 text-sm font-normal text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Verified
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {/* Full Name */}
        <FormField
          label="Full Name"
          required
          error={fieldError("full_name")}
          {...register(`${prefix}.full_name`)}
          className="sm:col-span-2"
        />

        {/* Phone */}
        <FormField
          label="Phone"
          required={phoneRequired}
          error={fieldError("phone")}
          {...register(`${prefix}.phone`)}
        />

        {/* Address Line 1 */}
        <FormField
          label="Address Line 1"
          required
          error={fieldError("address_line1")}
          {...register(`${prefix}.address_line1`)}
          className="sm:col-span-2"
        />

        {/* Address Line 2 */}
        <FormField
          label="Address Line 2"
          {...register(`${prefix}.address_line2`)}
          className="sm:col-span-2"
        />

        {/* State / Province / Emirate — searchable dropdown */}
        <Controller
          name={`${prefix}.region_code`}
          control={control}
          render={({ field }) => (
            <RegionSelect
              id={`${prefix}-region`}
              countryCode={countryCode}
              value={field.value ?? ""}
              onChange={(code) => {
                field.onChange(code);
                // Reset city when region changes
                setValue(`${prefix}.city`, "");
              }}
              label={stateLabel}
              required={stateRequired}
              error={fieldError("region_code") ?? fieldError("state")}
            />
          )}
        />

        {/* City — async searchable dropdown */}
        <Controller
          name={`${prefix}.city`}
          control={control}
          render={({ field }) => (
            <CitySearchSelect
              id={`${prefix}-city`}
              countryCode={countryCode}
              regionCode={regionCode}
              value={field.value ?? ""}
              onChange={field.onChange}
              label={cityLabel}
              required={cityRequired}
              allowFreeText={allowFreeCity}
              error={fieldError("city")}
            />
          )}
        />

        {/* Postal Code — country-aware label */}
        <PostalCodeField
          label={postalLabel}
          placeholder={postalExample}
          required={postalRequired}
          error={fieldError("postal_code")}
          {...register(`${prefix}.postal_code`)}
        />

        {/* Country — locked, read-only */}
        <CountryLockedField
          countryCode={countryCode}
          id={`${prefix}-country`}
        />
      </CardContent>

      {/* Server validation warnings */}
      {warnings.length > 0 && (
        <div className="mx-6 mb-4 flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="space-y-1">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}
