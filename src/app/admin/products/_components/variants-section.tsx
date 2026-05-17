"use client";

import { Check, Plus, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "react-hot-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminCreateVariant, useAdminDeleteVariant, useAdminUpdateVariant } from "@/features/admin/hooks/use-admin-products";
import { cn } from "@/lib/utils";
import type { ProductImage } from "@/types";
import type { VariantFormData } from "@/lib/validators";

import { buildVariantMatrix, generateVariantName, type AdminVariant } from "../catalog-utils";
import { VariantModal } from "./variant-modal";

interface Props {
  productId: string;
  variants: AdminVariant[];
  productImages?: ProductImage[];
}

// ── Matrix cell ───────────────────────────────────────────────────────────────

function MatrixCell({
  variant,
  onClick,
}: {
  variant: AdminVariant | undefined;
  onClick: () => void;
}) {
  if (!variant) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group relative flex h-12 w-full items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25 text-muted-foreground/40 transition-colors hover:border-primary/50 hover:text-primary/60 hover:bg-primary/5"
        title="Add variant"
      >
        <Plus className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }

  const levels = variant.inventory_levels ?? [];
  const qty = levels.reduce((s, l) => s + l.quantity, 0);
  const reserved = levels.reduce((s, l) => s + l.reserved, 0);
  const available = qty - reserved;

  const stockColor =
    !variant.is_active
      ? "bg-muted text-muted-foreground border-muted"
      : available <= 0
      ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
      : available <= 5
      ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
      : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex h-12 w-full flex-col items-center justify-center rounded-md border text-xs font-medium transition-all hover:shadow-sm",
        stockColor,
      )}
      title={`${variant.sku ?? "No SKU"} · ${available} available`}
    >
      {!variant.is_active ? (
        <span className="text-[10px]">Inactive</span>
      ) : (
        <>
          <Check className="h-3 w-3" />
          <span className="text-[10px] tabular-nums">{available} left</span>
        </>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function VariantsSection({ productId, variants, productImages = [] }: Props) {
  const [modalState, setModalState] = useState<{
    variant: AdminVariant | null;
    prefillColor?: string;
    prefillSize?: string;
  } | null>(null);

  const { mutate: createVariant, isPending: isCreating } = useAdminCreateVariant();
  const { mutate: updateVariant, isPending: isUpdating } = useAdminUpdateVariant();
  const { mutate: deleteVariant, isPending: isDeleting } = useAdminDeleteVariant();

  const matrix = buildVariantMatrix(variants);

  function openNew(color?: string, size?: string) {
    setModalState({ variant: null, prefillColor: color, prefillSize: size });
  }

  function openEdit(variant: AdminVariant) {
    setModalState({ variant });
  }

  function handleSave(data: VariantFormData, variantId: string | null) {
    if (variantId) {
      updateVariant(
        { variantId, productId, data },
        { onSuccess: () => setModalState(null) },
      );
    } else {
      createVariant(
        { productId, variant: data as Parameters<typeof createVariant>[0]["variant"] },
        { onSuccess: () => setModalState(null) },
      );
    }
  }

  function handleDelete(variantId: string) {
    deleteVariant(
      { variantId, productId },
      { onSuccess: () => setModalState(null) },
    );
  }

  // Generate missing SKUs from product code + color + size
  function handleGenerateMissing() {
    let generated = 0;
    for (const v of variants) {
      if (!v.sku) {
        const opts = (v.options ?? {}) as Record<string, string>;
        const colorCode = opts.color?.replace(/\s+/g, "").slice(0, 4).toUpperCase() ?? "DEF";
        const sizeCode = opts.size?.toUpperCase() ?? "ONE";
        const suggestedSku = `${colorCode}-${sizeCode}`;
        updateVariant({ variantId: v.id, productId, data: { sku: suggestedSku } });
        generated++;
      }
    }
    if (generated > 0) {
      toast.success(`Generated SKUs for ${generated} variant${generated !== 1 ? "s" : ""}`);
    } else {
      toast("All variants already have SKUs");
    }
  }

  const noVariantsYet = matrix.colors.length === 0;

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border-2 border-dashed border-muted-foreground/30" />
          No variant
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-green-100 border border-green-200" />
          In stock
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-amber-100 border border-amber-200" />
          Low stock (≤5)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-red-100 border border-red-200" />
          Out of stock
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-muted border" />
          Inactive
        </span>
      </div>

      {/* Matrix */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Variant Matrix</CardTitle>
            <CardDescription>Click a cell to edit an existing variant or create a new one.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleGenerateMissing}
            >
              <Wand2 className="h-3.5 w-3.5" />
              Generate Missing SKUs
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => openNew()}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Variant
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {noVariantsYet ? (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 text-center">
              <div className="rounded-full bg-muted p-3">
                <Plus className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium">No variants yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add variants to define colors, sizes, and SKUs for this product.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 gap-1.5"
                onClick={() => openNew()}
              >
                <Plus className="h-3.5 w-3.5" />
                Add First Variant
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="w-32 pb-3 text-left text-xs font-semibold text-muted-foreground">Color \ Size</th>
                    {matrix.sizes.map((size) => (
                      <th key={size} className="min-w-[80px] pb-3 text-center text-xs font-semibold text-muted-foreground">
                        {size}
                      </th>
                    ))}
                    {/* Extra column for adding new sizes */}
                    <th className="pb-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 rounded-full p-0 text-muted-foreground hover:text-primary"
                        title="Add size"
                        onClick={() => {
                          const size = prompt("New size (e.g. 2XL, 36, EU38):");
                          if (size?.trim()) openNew(matrix.colors[0] ?? "Default", size.trim());
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {matrix.colors.map((color) => (
                    <tr key={color}>
                      <td className="pr-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full border border-muted-foreground/30" style={{
                            backgroundColor: colorNameToCss(color),
                          }} />
                          <span className="text-sm font-medium capitalize">{color}</span>
                        </div>
                      </td>
                      {matrix.sizes.map((size) => {
                        const cell = matrix.cells.get(`${color}::${size}`);
                        return (
                          <td key={size} className="px-1 py-2">
                            <MatrixCell
                              variant={cell?.variant}
                              onClick={() =>
                                cell
                                  ? openEdit(cell.variant)
                                  : openNew(color, size)
                              }
                            />
                          </td>
                        );
                      })}
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Add new color */}
              <div className="mt-4 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => {
                    const color = prompt("New color name (e.g. Navy, Olive, Rust):");
                    if (color?.trim()) openNew(color.trim(), matrix.sizes[0] ?? "One Size");
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Color
                </Button>
                <span className="text-xs text-muted-foreground">
                  {variants.length} variant{variants.length !== 1 ? "s" : ""} total
                  {variants.filter((v) => !v.sku).length > 0 && (
                    <Badge variant="warning" className="ml-2 text-[10px]">
                      {variants.filter((v) => !v.sku).length} missing SKU
                    </Badge>
                  )}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flat variant list (for reference) */}
      {variants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">All Variants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-md border">
              {variants.map((v) => {
                const opts = (v.options ?? {}) as Record<string, string>;
                const levels = v.inventory_levels ?? [];
                const available = levels.reduce((s, l) => s + Math.max(0, l.quantity - l.reserved), 0);
                return (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-4 px-3 py-2 text-sm hover:bg-muted/30 cursor-pointer"
                    onClick={() => openEdit(v)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{generateVariantName(opts.color ?? null, opts.size ?? null)}</span>
                      {v.sku && (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                          {v.sku}
                        </code>
                      )}
                      {!v.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                      {v.is_default && <Badge variant="outline" className="text-[10px]">Default</Badge>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {v.price !== null && v.price !== undefined && (
                        <span>₹{v.price.toLocaleString()}</span>
                      )}
                      <span>{available} in stock</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal */}
      {modalState !== null && (
        <VariantModal
          variant={modalState.variant}
          productId={productId}
          prefillColor={modalState.prefillColor}
          prefillSize={modalState.prefillSize}
          productImages={productImages}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModalState(null)}
          isSaving={isCreating || isUpdating}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}

// Simple color name → CSS color approximation for swatches
function colorNameToCss(name: string): string {
  const map: Record<string, string> = {
    black: "#1a1a1a", white: "#f8f8f8", navy: "#001f5b", red: "#dc2626",
    blue: "#2563eb", green: "#16a34a", yellow: "#ca8a04", purple: "#9333ea",
    pink: "#ec4899", orange: "#ea580c", grey: "#6b7280", gray: "#6b7280",
    beige: "#d4b896", cream: "#faf0dc", brown: "#92400e", olive: "#737007",
    teal: "#0d9488", maroon: "#7f1d1d", rust: "#b45309",
  };
  return map[name.toLowerCase()] ?? "#9ca3af";
}
