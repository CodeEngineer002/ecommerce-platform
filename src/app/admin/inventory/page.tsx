"use client";

import { useState } from "react";

import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminProducts, useAdminUpdateInventory } from "@/features/admin/hooks/use-admin-products";

export default function AdminInventoryPage() {
  const { data: productsData, isLoading } = useAdminProducts();
  const products = productsData?.data ?? [];
  const { mutate: updateInventory } = useAdminUpdateInventory();
  const [editing, setEditing] = useState<Record<string, number>>({});

  if (isLoading) return <LoadingState text="Loading inventory…" />;

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" description="Manage stock levels for all variants" />

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Product</th>
              <th className="px-4 py-3 text-left font-medium">Variant</th>
              <th className="px-4 py-3 text-right font-medium">In Stock</th>
              <th className="px-4 py-3 text-right font-medium">Reserved</th>
              <th className="px-4 py-3 text-right font-medium">Available</th>
              <th className="px-4 py-3 text-right font-medium">Update</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.flatMap((product) => {
              const p = product as typeof product & {
                variants?: Array<{ id: string; name: string; inventory?: { quantity: number; reserved: number } | null }>;
              };
              return (p.variants ?? []).map((variant) => {
                const inv = variant.inventory;
                const available = (inv?.quantity ?? 0) - (inv?.reserved ?? 0);
                return (
                  <tr key={variant.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{product.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{variant.name}</td>
                    <td className="px-4 py-3 text-right">{inv?.quantity ?? 0}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{inv?.reserved ?? 0}</td>
                    <td className={`px-4 py-3 text-right font-medium ${available <= 5 ? "text-red-600" : "text-green-600"}`}>
                      {available}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Input
                          type="number"
                          className="h-8 w-20 text-right"
                          defaultValue={inv?.quantity ?? 0}
                          min={0}
                          onChange={(e) =>
                            setEditing((prev) => ({ ...prev, [variant.id]: Number(e.target.value) }))
                          }
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const qty = editing[variant.id] ?? inv?.quantity ?? 0;
                            updateInventory({ variantId: variant.id, quantity: qty });
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
