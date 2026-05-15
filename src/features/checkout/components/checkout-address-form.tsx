"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import type { AddressInput, CustomerAddress } from "@/domain/address/types";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CountryLockedField } from "./country-locked-field";
import { PhoneField } from "./phone-field";
import { RegionSelect } from "./region-select";
import { CitySearchSelect } from "./city-search-select";
import { useLocationRules } from "@/features/checkout/hooks/use-locations";

// ── Schema ────────────────────────────────────────────────────────────────────

const checkoutAddressFormSchema = z.object({
  first_name:          z.string().min(1, "First name is required").max(100),
  last_name:           z.string().max(100).optional().default(""),
  address_line1:       z.string().min(3, "Address is required").max(200),
  address_line2:       z.string().max(200).optional(),
  city:                z.string().min(1, "City is required"),
  region_code:         z.string().optional().default(""),
  state:               z.string().optional().default(""),
  postal_code:         z.string().max(20).optional().default(""),
  phone:               z.string().max(30).optional(),
  label:               z.string().max(50).optional(),
  is_default_shipping: z.boolean().optional().default(false),
  is_default_billing:  z.boolean().optional().default(false),
});

type FormData = z.infer<typeof checkoutAddressFormSchema>;

// ── Props ─────────────────────────────────────────────────────────────────────

interface CheckoutAddressFormProps {
  countryCode: string;         // locked from storefront URL
  editingAddress?: CustomerAddress | null;
  isPending: boolean;
  onSubmit: (input: AddressInput) => void;
  onCancel: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CheckoutAddressForm({
  countryCode,
  editingAddress,
  isPending,
  onSubmit,
  onCancel,
}: CheckoutAddressFormProps) {
  const { data: rules } = useLocationRules(countryCode);

  const stateLabel    = rules?.state_label    ?? "State / Province";
  const postalLabel   = rules?.postal_code_label ?? "Postal Code";
  const postalExample = rules?.postal_code_example ?? undefined;
  const postalRequired = rules?.postal_code_required ?? true;

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(checkoutAddressFormSchema),
    defaultValues: {
      first_name:          editingAddress?.first_name ?? "",
      last_name:           editingAddress?.last_name  ?? "",
      address_line1:       editingAddress?.address_line1 ?? "",
      address_line2:       editingAddress?.address_line2 ?? "",
      city:                editingAddress?.city ?? "",
      region_code:         "",
      state:               editingAddress?.state ?? "",
      postal_code:         editingAddress?.postal_code ?? "",
      phone:               editingAddress?.phone ?? "",
      label:               editingAddress?.label ?? "",
      is_default_shipping: editingAddress?.is_default_shipping ?? false,
      is_default_billing:  editingAddress?.is_default_billing  ?? false,
    },
  });

  const regionCode = watch("region_code") ?? "";

  // When region changes, reset city
  useEffect(() => {
    setValue("city", "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionCode]);

  function handleFormSubmit(data: FormData) {
    onSubmit({
      first_name:          data.first_name,
      last_name:           data.last_name ?? "",
      address_line1:       data.address_line1,
      address_line2:       data.address_line2 ?? "",
      city:                data.city,
      state:               data.state || data.region_code || "",
      postal_code:         data.postal_code ?? "",
      phone:               data.phone ?? "",
      label:               data.label ?? "",
      country_code:        countryCode,
      is_default_shipping: data.is_default_shipping ?? false,
      is_default_billing:  data.is_default_billing  ?? false,
    });
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">
        {editingAddress ? "Edit Address" : "Add New Address"}
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* First Name / Last Name */}
        <FormField
          label="First Name"
          required
          error={errors.first_name}
          {...register("first_name")}
        />
        <FormField
          label="Last Name"
          error={errors.last_name}
          {...register("last_name")}
        />

        {/* Address Line 1 */}
        <FormField
          label="Address Line 1"
          required
          error={errors.address_line1}
          {...register("address_line1")}
          className="sm:col-span-2"
        />

        {/* Address Line 2 */}
        <FormField
          label="Address Line 2"
          {...register("address_line2")}
          className="sm:col-span-2"
        />

        {/* State / Province */}
        <Controller
          name="region_code"
          control={control}
          render={({ field }) => (
            <RegionSelect
              id="form-region"
              countryCode={countryCode}
              value={field.value ?? ""}
              onChange={(code) => {
                field.onChange(code);
                setValue("city", "");
              }}
              label={stateLabel}
              error={errors.region_code?.message}
            />
          )}
        />

        {/* City */}
        <Controller
          name="city"
          control={control}
          render={({ field }) => (
            <CitySearchSelect
              id="form-city"
              countryCode={countryCode}
              regionCode={regionCode}
              value={field.value ?? ""}
              onChange={field.onChange}
              label="City"
              required
              allowFreeText={rules?.allows_free_text_city ?? true}
              error={errors.city?.message}
            />
          )}
        />

        {/* Postal Code */}
        <FormField
          label={postalLabel}
          required={postalRequired}
          placeholder={postalExample}
          error={errors.postal_code}
          {...register("postal_code")}
        />

        {/* Country — locked */}
        <CountryLockedField countryCode={countryCode} id="form-country" />

        {/* Phone */}
        <Controller
          name="phone"
          control={control}
          render={({ field }) => (
            <PhoneField
              id="form-phone"
              name={field.name}
              countryCode={countryCode}
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={errors.phone?.message}
            />
          )}
        />

        {/* Label (optional) */}
        <FormField
          label="Address Label (optional)"
          placeholder="Home, Office…"
          {...register("label")}
        />
      </div>

      {/* Defaults */}
      <div className="flex flex-wrap gap-4 pt-1">
        <Controller
          name="is_default_shipping"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox id="default-shipping" checked={!!field.value} onCheckedChange={field.onChange} />
              <Label htmlFor="default-shipping" className="text-sm">Set as default shipping</Label>
            </div>
          )}
        />
        <Controller
          name="is_default_billing"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox id="default-billing" checked={!!field.value} onCheckedChange={field.onChange} />
              <Label htmlFor="default-billing" className="text-sm">Set as default billing</Label>
            </div>
          )}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button type="button" size="sm" loading={isPending} onClick={handleSubmit(handleFormSubmit)}>
          {editingAddress ? "Update Address" : "Save Address"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
