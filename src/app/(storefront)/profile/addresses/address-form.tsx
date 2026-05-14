"use client";

/**
 * AddressForm — country-aware address entry form.
 *
 * Dynamically adjusts required fields and labels based on the selected
 * country's rules (postal code label, state required, phone required, etc.)
 */

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import type { AddressCountryRules, AddressInput } from "@/domain/address/types";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Supported countries ───────────────────────────────────────────────────────

const SUPPORTED_COUNTRIES = [
  { id: "us", iso: "US", name: "United States" },
  { id: "uk", iso: "GB", name: "United Kingdom" },
  { id: "de", iso: "DE", name: "Germany" },
  { id: "fr", iso: "FR", name: "France" },
  { id: "it", iso: "IT", name: "Italy" },
  { id: "es", iso: "ES", name: "Spain" },
  { id: "in", iso: "IN", name: "India" },
  { id: "ae", iso: "AE", name: "United Arab Emirates" },
];

const ISO_TO_ID: Record<string, string> = {
  US: "us", GB: "uk", DE: "de", FR: "fr",
  IT: "it", ES: "es", IN: "in", AE: "ae",
};

// ── Form schema (relaxed — server-side runs strict country validation) ─────────

const addressFormSchema = z.object({
  first_name:            z.string().min(1, "First name is required").max(100),
  last_name:             z.string().max(100).optional().default(""),
  company:               z.string().max(200).optional(),
  phone:                 z.string().max(30).optional(),
  email:                 z.string().email("Invalid email").optional().or(z.literal("")),
  address_line1:         z.string().min(3, "Address line 1 is required").max(200),
  address_line2:         z.string().max(200).optional(),
  city:                  z.string().min(1, "City is required").max(100),
  state:                 z.string().max(100).optional().default(""),
  postal_code:           z.string().max(20).optional().default(""),
  country_code:          z.string().min(2).max(2).toUpperCase(),
  country_id:            z.string().optional(),
  label:                 z.string().max(50).optional(),
  delivery_instructions: z.string().max(500).optional(),
  is_default_shipping:   z.boolean().optional().default(false),
  is_default_billing:    z.boolean().optional().default(false),
});

type FormData = z.infer<typeof addressFormSchema>;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  defaultValues?: Partial<AddressInput>;
  countryRules: AddressCountryRules[];
  isPending: boolean;
  onSubmit: (input: AddressInput) => void;
  onCancel?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AddressForm({
  defaultValues,
  countryRules,
  isPending,
  onSubmit,
  onCancel,
}: Props) {
  const rulesMap = useMemo(
    () =>
      Object.fromEntries(
        countryRules.map((r) => [
          r.country_id,
          r,
        ]),
      ) as Record<string, AddressCountryRules>,
    [countryRules],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: {
      first_name:            defaultValues?.first_name ?? "",
      last_name:             defaultValues?.last_name ?? "",
      company:               defaultValues?.company ?? "",
      phone:                 defaultValues?.phone ?? "",
      email:                 defaultValues?.email ?? "",
      address_line1:         defaultValues?.address_line1 ?? "",
      address_line2:         defaultValues?.address_line2 ?? "",
      city:                  defaultValues?.city ?? "",
      state:                 defaultValues?.state ?? "",
      postal_code:           defaultValues?.postal_code ?? "",
      country_code:          defaultValues?.country_code ?? "IN",
      country_id:            defaultValues?.country_id ?? "in",
      label:                 defaultValues?.label ?? "",
      delivery_instructions: defaultValues?.delivery_instructions ?? "",
      is_default_shipping:   defaultValues?.is_default_shipping ?? false,
      is_default_billing:    defaultValues?.is_default_billing ?? false,
    },
  });

  const countryCode = watch("country_code");
  const countryId = ISO_TO_ID[countryCode] ?? countryCode.toLowerCase();
  const rules = rulesMap[countryId] ?? null;

  // Sync country_id when country_code changes
  useEffect(() => {
    setValue("country_id", countryId);
  }, [countryCode, countryId, setValue]);

  function handleCountryChange(iso: string) {
    setValue("country_code", iso.toUpperCase());
  }

  function submitHandler(data: FormData) {
    onSubmit({
      ...data,
      phone:     data.phone || undefined,
      email:     data.email || undefined,
      company:   data.company || undefined,
      address_line2: data.address_line2 || undefined,
      label:     data.label || undefined,
      delivery_instructions: data.delivery_instructions || undefined,
    } as AddressInput);
  }

  const stateLabel = rules?.state_label ?? "State / Province";
  const postalLabel = rules?.postal_code_label ?? "Postal Code";
  const stateRequired = rules?.state_required ?? false;
  const postalRequired = rules?.postal_code_required ?? true;
  const phoneRequired = rules?.phone_required ?? false;

  return (
    <form onSubmit={handleSubmit(submitHandler)} className="space-y-4">
      {/* Name row */}
      <div className="grid grid-cols-2 gap-4">
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
      </div>

      <FormField
        label="Company"
        error={errors.company}
        {...register("company")}
      />

      {/* Contact */}
      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Phone"
          type="tel"
          required={phoneRequired}
          error={errors.phone}
          {...register("phone")}
        />
        <FormField
          label="Email"
          type="email"
          error={errors.email}
          {...register("email")}
        />
      </div>

      {/* Country selector */}
      <div className="space-y-1.5">
        <Label>
          Country <span className="text-destructive">*</span>
        </Label>
        <Select
          value={countryCode}
          onValueChange={handleCountryChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select country" />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_COUNTRIES.map((c) => (
              <SelectItem key={c.iso} value={c.iso}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Address lines */}
      <FormField
        label="Address Line 1"
        required
        error={errors.address_line1}
        {...register("address_line1")}
      />
      <FormField
        label="Address Line 2"
        error={errors.address_line2}
        {...register("address_line2")}
      />

      {/* City / State / Postal */}
      <div className="grid grid-cols-3 gap-4">
        <FormField
          label="City"
          required
          error={errors.city}
          {...register("city")}
        />
        <FormField
          label={stateLabel}
          required={stateRequired}
          error={errors.state}
          {...register("state")}
        />
        <FormField
          label={postalLabel}
          required={postalRequired}
          error={errors.postal_code}
          {...register("postal_code")}
        />
      </div>

      {/* Label */}
      <FormField
        label="Label (e.g. Home, Office)"
        error={errors.label}
        {...register("label")}
      />

      {/* Delivery instructions */}
      <FormField
        label="Delivery Instructions"
        error={errors.delivery_instructions}
        {...register("delivery_instructions")}
      />

      {/* Default flags */}
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4"
            {...register("is_default_shipping")}
          />
          Default shipping address
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4"
            {...register("is_default_billing")}
          />
          Default billing address
        </label>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save Address"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
