"use client";

import { Edit, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable, type ColumnDef } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useAdminDeleteProduct,
  useAdminProducts,
} from "@/features/admin/hooks/use-admin-products";
import { ROUTES } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/types";

// Matches the partial select in adminGetProducts — not the full ProductImage row
type AdminProductImage = { id: string; url: string; is_primary: boolean; sort_order: number };

type ProductRow = Product & {
  category?: { id: string; name: string } | null;
  images?: AdminProductImage[];
};

const columns = (
  onDelete: (id: string) => void,
): ColumnDef<ProductRow>[] => [
  {
    header: "Product",
    cell: (p) => {
      const primaryImage = p.images?.find((i) => i.is_primary)?.url ?? p.images?.[0]?.url;
      return (
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
            {primaryImage && (
              <Image src={primaryImage} alt={p.name} fill className="object-cover" sizes="40px" />
            )}
          </div>
          <div>
            <p className="font-medium">{p.name}</p>
            <p className="text-xs text-muted-foreground">{p.sku}</p>
          </div>
        </div>
      );
    },
  },
  {
    header: "Category",
    cell: (p) => <span className="text-muted-foreground">{p.category?.name ?? "—"}</span>,
  },
  {
    header: "Price",
    align: "right",
    cell: (p) => formatPrice(p.base_price),
  },
  {
    header: "Status",
    align: "center",
    cell: (p) => (
      <Badge variant={p.is_active ? "success" : "secondary"}>
        {p.is_active ? "Active" : "Draft"}
      </Badge>
    ),
  },
  {
    header: "Actions",
    align: "right",
    cell: (p) => (
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href={ROUTES.admin.editProduct(p.id)}>
            <Edit className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          onClick={() => onDelete(p.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    ),
  },
];

export default function AdminProductsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminProducts(page);
  const { mutate: deleteProduct, isPending: isDeleting } = useAdminDeleteProduct();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const products = (data?.data ?? []) as ProductRow[];

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

      <DataTable
        columns={columns(setDeleteId)}
        data={products}
        keyFn={(p) => p.id}
        isLoading={isLoading}
        loadingText="Loading products…"
        emptyTitle="No products yet"
        emptyDescription="Create your first product to get started."
        page={page}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
      />

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
