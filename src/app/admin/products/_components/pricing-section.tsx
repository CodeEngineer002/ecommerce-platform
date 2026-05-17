"use client";

import type { UseFormRegister, FieldErrors } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductFormData } from "@/lib/validators";

interface Props {
  register: UseFormRegister<ProductFormData>;
  errors: FieldErrors<ProductFormData>;
}

export function PricingSection({ register, errors }: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>
            Base price applies to all variants unless a per-variant price override is set.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Price (₹)"
            type="number"
            required
            error={errors.base_price}
            description="The selling price shown on the storefront."
            {...register("base_price", { valueAsNumber: true })}
          />
          <FormField
            label="Compare Price (₹)"
            type="number"
            error={errors.compare_price}
            description="Original / crossed-out price. Shown as a discount when set."
            {...register("compare_price", { valueAsNumber: true })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Product Identifier</CardTitle>
          <CardDescription>
            The product code is a stable business identifier that does not change when the
            product name changes. Used in inventory, orders, and warehouse operations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormField
            label="Product Code"
            error={errors.product_code}
            placeholder="e.g. FASH-003, ELEC-001"
            description="Uppercase letters, digits, and hyphens only. Must be unique across your catalog."
            {...register("product_code", {
              onChange: (e) => {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
              },
            })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
