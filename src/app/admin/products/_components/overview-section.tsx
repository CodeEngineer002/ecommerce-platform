"use client";

import type { UseFormRegister, FieldErrors } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductFormData } from "@/lib/validators";

interface Props {
  register: UseFormRegister<ProductFormData>;
  errors: FieldErrors<ProductFormData>;
  onNameChange?: (name: string) => void;
}

export function OverviewSection({ register, errors, onNameChange }: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>Product name and descriptions shown on the storefront.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            label="Product Name"
            required
            error={errors.name}
            {...register("name", {
              onChange: (e) => onNameChange?.(e.target.value),
            })}
          />
          <FormField
            label="Slug"
            required
            error={errors.slug}
            description="URL-friendly identifier — used in the product page URL. Must be unique."
            {...register("slug")}
          />
          <FormField
            label="Short Description"
            as="textarea"
            rows={2}
            error={errors.short_desc}
            description="Shown below the product title on the PDP. Max 200 characters."
            {...register("short_desc")}
          />
          <FormField
            label="Full Description"
            as="textarea"
            rows={8}
            description="Rich product description. Markdown is supported."
            {...register("description")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
