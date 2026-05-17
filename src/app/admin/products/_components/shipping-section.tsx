"use client";

import type { UseFormRegister } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductFormData } from "@/lib/validators";

// Shipping fields are from migration 00027 — extend form data type locally
type ShippingFields = {
  weight?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  fulfillment_type?: string | null;
  tax_class?: string | null;
  is_returnable?: boolean;
};

interface Props {
  register: UseFormRegister<ProductFormData>;
  shippingValues?: ShippingFields;
  onShippingChange: (field: keyof ShippingFields, value: unknown) => void;
}

const FULFILLMENT_TYPES = [
  { value: "standard", label: "Standard" },
  { value: "digital", label: "Digital / Download" },
  { value: "preorder", label: "Pre-order" },
  { value: "backorder", label: "Back-order" },
];

const TAX_CLASSES = [
  { value: "GST_0", label: "GST 0% (Exempt)" },
  { value: "GST_5", label: "GST 5%" },
  { value: "GST_12", label: "GST 12%" },
  { value: "GST_18", label: "GST 18%" },
  { value: "GST_28", label: "GST 28%" },
  { value: "VAT_5", label: "VAT 5%" },
  { value: "VAT_10", label: "VAT 10%" },
  { value: "VAT_20", label: "VAT 20%" },
  { value: "EXEMPT", label: "Tax Exempt" },
];

export function ShippingSection({ register, shippingValues = {}, onShippingChange }: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Physical Dimensions</CardTitle>
          <CardDescription>
            Used for shipping rate calculation. All fields are optional.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField
            label="Weight (kg)"
            type="number"
            placeholder="0.000"
            {...register("weight" as keyof ProductFormData, { valueAsNumber: true })}
          />
          <FormField
            label="Length (cm)"
            type="number"
            placeholder="0.00"
            value={shippingValues.length_cm ?? ""}
            onChange={(e) => onShippingChange("length_cm", e.target.valueAsNumber || null)}
          />
          <FormField
            label="Width (cm)"
            type="number"
            placeholder="0.00"
            value={shippingValues.width_cm ?? ""}
            onChange={(e) => onShippingChange("width_cm", e.target.valueAsNumber || null)}
          />
          <FormField
            label="Height (cm)"
            type="number"
            placeholder="0.00"
            value={shippingValues.height_cm ?? ""}
            onChange={(e) => onShippingChange("height_cm", e.target.valueAsNumber || null)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fulfillment & Tax</CardTitle>
          <CardDescription>
            Controls warehouse workflow and tax classification for this product.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Fulfillment Type</Label>
            <Select
              value={shippingValues.fulfillment_type ?? "standard"}
              onValueChange={(v) => onShippingChange("fulfillment_type", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FULFILLMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Tax Class</Label>
            <Select
              value={shippingValues.tax_class ?? ""}
              onValueChange={(v) => onShippingChange("tax_class", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select tax class" />
              </SelectTrigger>
              <SelectContent>
                {TAX_CLASSES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Return Policy</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-center gap-3">
            <Checkbox
              checked={shippingValues.is_returnable ?? true}
              onCheckedChange={(v) => onShippingChange("is_returnable", !!v)}
            />
            <div>
              <p className="text-sm font-medium">Eligible for return</p>
              <p className="text-xs text-muted-foreground">
                Disable for digital products, perishables, or final-sale items.
              </p>
            </div>
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
