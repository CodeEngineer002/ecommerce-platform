"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductImage } from "@/types";
import { variantSchema, type VariantFormData } from "@/lib/validators";
import type { AdminVariant } from "../catalog-utils";

interface Props {
  variant: AdminVariant | null;
  productId: string;
  prefillColor?: string;
  prefillSize?: string;
  productImages?: ProductImage[];
  onSave: (data: VariantFormData, variantId: string | null) => void;
  onDelete?: (variantId: string) => void;
  onClose: () => void;
  isSaving?: boolean;
  isDeleting?: boolean;
}

export function VariantModal({
  variant,
  productId,
  prefillColor,
  prefillSize,
  productImages = [],
  onSave,
  onDelete,
  onClose,
  isSaving,
  isDeleting,
}: Props) {
  const isNew = !variant;

  const defaultValues: Partial<VariantFormData> = {
    product_id: productId,
    name: variant?.name ?? ([prefillColor, prefillSize].filter(Boolean).join(" / ") || ""),
    sku: variant?.sku ?? "",
    price: variant?.price ?? undefined,
    color_code: variant?.color_code ?? undefined,
    size_code: variant?.size_code ?? undefined,
    is_active: variant?.is_active ?? true,
    is_default: variant?.is_default ?? false,
    options: (variant?.options as Record<string, string>) ?? {
      ...(prefillColor ? { color: prefillColor } : {}),
      ...(prefillSize ? { size: prefillSize } : {}),
    },
  };

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<VariantFormData>({
    resolver: zodResolver(variantSchema),
    defaultValues,
  });

  useEffect(() => {
    reset(defaultValues);
  }, [variant?.id, prefillColor, prefillSize]);

  const isActive = watch("is_active");
  const isDefault = watch("is_default");
  const assignedImageId = watch("options")?.imageId as string | undefined;

  function handleSave(data: VariantFormData) {
    onSave(data, variant?.id ?? null);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add Variant" : "Edit Variant"}</DialogTitle>
          <DialogDescription>
            {isNew
              ? `Creating variant for ${[prefillColor, prefillSize].filter(Boolean).join(" / ")}`
              : `Editing: ${variant.name}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
          {/* Variant name */}
          <FormField
            label="Variant Name"
            required
            error={errors.name}
            placeholder="e.g. Black / XL"
            {...register("name")}
          />

          {/* SKU */}
          <FormField
            label="SKU"
            required={!isNew}
            error={errors.sku}
            placeholder="e.g. FASH-003-BLK-XL"
            description="Unique variant identifier. Auto-generate from product code + color + size."
            {...register("sku", {
              onChange: (e) => {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
              },
            })}
          />

          {/* Color + Size codes */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Color Code"
              error={errors.color_code}
              placeholder="BLK, BEI, OLV…"
              description="2–6 uppercase letters"
              {...register("color_code", {
                onChange: (e) => {
                  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
                },
              })}
            />
            <FormField
              label="Size Code"
              error={errors.size_code}
              placeholder="XS, S, M, L, XL…"
              {...register("size_code", {
                onChange: (e) => {
                  e.target.value = e.target.value.toUpperCase();
                },
              })}
            />
          </div>

          {/* Price override */}
          <FormField
            label="Price Override (₹)"
            type="number"
            error={errors.price}
            description="Leave empty to use the product's base price."
            {...register("price", { valueAsNumber: true })}
          />

          {/* Barcode */}
          <FormField
            label="Barcode (GTIN/EAN/UPC)"
            error={errors.barcode}
            placeholder="Optional"
            {...register("barcode")}
          />

          {/* Variant image assignment */}
          {productImages.length > 0 && (
            <div className="space-y-1.5">
              <Label>Variant Image</Label>
              <Select
                value={assignedImageId ?? "none"}
                onValueChange={(v) =>
                  setValue("options", {
                    ...(watch("options") ?? {}),
                    imageId: v === "none" ? undefined : v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an image" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific image</SelectItem>
                  {productImages.map((img, i) => (
                    <SelectItem key={img.id} value={img.id}>
                      Image {i + 1}{img.is_primary ? " (Primary)" : ""}
                      {img.alt_text ? ` — ${img.alt_text}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Toggles */}
          <div className="flex flex-col gap-3 pt-1">
            <label className="flex cursor-pointer items-center gap-3">
              <Checkbox
                checked={isActive}
                onCheckedChange={(v) => setValue("is_active", !!v)}
              />
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive variants are hidden from the storefront.
                </p>
              </div>
              {!isActive && <Badge variant="secondary" className="ml-auto text-xs">Hidden</Badge>}
            </label>
            <label className="flex cursor-pointer items-center gap-3">
              <Checkbox
                checked={isDefault}
                onCheckedChange={(v) => setValue("is_default", !!v)}
              />
              <div>
                <p className="text-sm font-medium">Default variant</p>
                <p className="text-xs text-muted-foreground">
                  Shown first on the PDP.
                </p>
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            {!isNew && onDelete && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(variant!.id)}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete variant"}
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : isNew ? "Create Variant" : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
