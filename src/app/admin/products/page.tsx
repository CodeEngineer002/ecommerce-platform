"use client";

import { Edit, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/feedback/loading-state";
import { ROUTES } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import {
  useAdminDeleteProduct,
  useAdminProducts,
} from "@/features/admin/hooks/use-admin-products";

export default function AdminProductsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminProducts(page);
  const { mutate: deleteProduct, isPending: isDeleting } = useAdminDeleteProduct();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const products = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  if (isLoading) return <LoadingState text="Loading products…" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description={`${data?.count ?? 0} products`}
        action={
          <Button asChild>
            <Link href={ROUTES.admin.newProduct}>
              <Plus className="mr-1 h-4 w-4" /> New Product
            </Link>
          </Button>
        }
      />

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Product</th>
              <th className="px-4 py-3 text-left font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.map((product) => {
              const p = product as typeof product & {
                category?: { name: string } | null;
                images?: { url: string; is_primary?: boolean }[];
              };
              const primaryImage =
                p.images?.find((i) => i.is_primary)?.url ?? p.images?.[0]?.url;

              return (
                <tr key={product.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                        {primaryImage && (
                          <Image
                            src={primaryImage}
                            alt={product.name}
                            fill
                            className="object-cover"
                            sizes="40px"
                          />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.category?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{formatPrice(product.base_price)}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={product.is_active ? "success" : "secondary"}>
                      {product.is_active ? "Active" : "Draft"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={ROUTES.admin.editProduct(product.id)}>
                          <Edit className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(product.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete Product"
        description="This action cannot be undone. The product will be permanently removed."
        variant="destructive"
        confirmLabel="Delete"
        loading={isDeleting}
        onConfirm={() => {
          if (deleteId) {
            deleteProduct(deleteId, { onSuccess: () => setDeleteId(null) });
          }
        }}
      />
    </div>
  );
}
