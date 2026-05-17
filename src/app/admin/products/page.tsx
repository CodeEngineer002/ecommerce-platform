"use client";

import {
  Archive, Copy, Edit, ExternalLink, Layers, MoreHorizontal, PackageSearch,
  Plus, Power, Star, Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable, type ColumnDef } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useAdminArchiveProduct,
  useAdminDeleteProduct,
  useAdminDuplicateProduct,
  useAdminProducts,
  useAdminUpdateProduct,
} from "@/features/admin/hooks/use-admin-products";
import { useCategories } from "@/features/products/hooks/use-categories";
import { ROUTES } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import { toast } from "react-hot-toast";

import {
  computeHierarchy,
  computeInventorySummary,
  computePriceRange,
  computeProductStatus,
  filterProducts,
  formatRelativeTime,
  STATUS_CONFIG,
  type AdminProductRow,
  type ProductFilters,
} from "./catalog-utils";
import { ProductFilterBar } from "./_components/product-filters";

// ── Helpers ───────────────────────────────────────────────────────────────────

const REGION_FLAGS: Record<string, string> = {
  IN: "🇮🇳", US: "🇺🇸", GB: "🇬🇧", UK: "🇬🇧", DE: "🇩🇪", FR: "🇫🇷",
  AE: "🇦🇪", AU: "🇦🇺", CA: "🇨🇦", SG: "🇸🇬", JP: "🇯🇵",
};

function MarketChips({ countryIds }: { countryIds: string[] | null | undefined }) {
  if (!countryIds || countryIds.length === 0) {
    return <span className="text-xs text-muted-foreground">All markets</span>;
  }
  const shown = countryIds.slice(0, 3);
  const rest = countryIds.length - 3;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((c) => (
        <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono">
          {REGION_FLAGS[c] ?? ""} {c}
        </span>
      ))}
      {rest > 0 && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          +{rest}
        </span>
      )}
    </div>
  );
}

// ── Quick Actions ─────────────────────────────────────────────────────────────

function QuickActions({ product, onDelete }: { product: AdminProductRow; onDelete: () => void }) {
  const { mutate: updateProduct } = useAdminUpdateProduct();
  const { mutate: duplicate, isPending: isDuplicating } = useAdminDuplicateProduct();
  const { mutate: archive, isPending: isArchiving } = useAdminArchiveProduct();

  const status = computeProductStatus(product.is_active, product.deleted_at);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href={ROUTES.admin.editProduct(product.id)} className="flex items-center gap-2">
            <Edit className="h-4 w-4" /> Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.open(ROUTES.product(product.slug), "_blank")}
        >
          <ExternalLink className="mr-2 h-4 w-4" /> Preview PDP
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={`${ROUTES.admin.inventory}?q=${product.product_code ?? product.sku ?? ""}`}
            className="flex items-center gap-2"
          >
            <PackageSearch className="h-4 w-4" /> Open Inventory
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => duplicate(product.id)}
          disabled={isDuplicating}
        >
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            updateProduct({
              id: product.id,
              data: { is_active: !product.is_active } as Parameters<typeof updateProduct>[0]["data"],
            })
          }
        >
          <Power className="mr-2 h-4 w-4" />
          {product.is_active ? "Deactivate" : "Activate"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const url = `${window.location.origin}${ROUTES.product(product.slug)}`;
            navigator.clipboard.writeText(url);
            toast.success("Product link copied");
          }}
        >
          <Copy className="mr-2 h-4 w-4" /> Copy link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {status !== "archived" && (
          <DropdownMenuItem
            onClick={() => archive(product.id)}
            disabled={isArchiving}
            className="text-amber-600 focus:text-amber-600"
          >
            <Archive className="mr-2 h-4 w-4" /> Archive
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Column definitions ────────────────────────────────────────────────────────

function buildColumns(onDelete: (id: string) => void): ColumnDef<AdminProductRow>[] {
  return [
    {
      header: "Product",
      cell: (p) => {
        const primaryImage =
          p.images?.find((i) => i.is_primary)?.url ?? p.images?.[0]?.url;
        const status = computeProductStatus(p.is_active, p.deleted_at);
        const cfg = STATUS_CONFIG[status];
        return (
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border bg-muted">
              {primaryImage && (
                <Image src={primaryImage} alt={p.name} fill className="object-cover" sizes="40px" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium text-sm leading-tight">{p.name}</p>
                {p.is_featured && (
                  <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {p.product_code && (
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {p.product_code}
                  </code>
                )}
                <Badge variant={cfg.variant} className="text-[10px] py-0 px-1.5 h-4">
                  {cfg.label}
                </Badge>
              </div>
            </div>
          </div>
        );
      },
    },
    {
      header: "Variants",
      cell: (p) => {
        const { variantCount, colorCount, sizeCount, skuCount } = computeHierarchy(
          (p.variants ?? []) as Parameters<typeof computeHierarchy>[0],
        );
        if (variantCount === 0) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-medium text-foreground">{variantCount} variants</p>
              {colorCount > 0 && <p>{colorCount} colors · {sizeCount} sizes</p>}
              {skuCount > 0 && <p>{skuCount} SKUs</p>}
            </div>
          </div>
        );
      },
    },
    {
      header: "Inventory",
      align: "right",
      cell: (p) => {
        const { totalStock, oosCount, lowStockCount } = computeInventorySummary(
          (p.variants ?? []) as Parameters<typeof computeInventorySummary>[0],
        );
        return (
          <div className="text-right text-xs space-y-0.5">
            <p className="font-medium tabular-nums">{totalStock} units</p>
            {oosCount > 0 && (
              <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4">
                {oosCount} OOS
              </Badge>
            )}
            {lowStockCount > 0 && oosCount === 0 && (
              <Badge variant="warning" className="text-[10px] py-0 px-1.5 h-4">
                {lowStockCount} low
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      header: "Price",
      align: "right",
      cell: (p) => {
        const { min, max } = computePriceRange(
          p.base_price,
          (p.variants ?? []) as Parameters<typeof computePriceRange>[1],
        );
        return (
          <div className="text-right text-sm tabular-nums">
            {min === max ? (
              formatPrice(min)
            ) : (
              <>
                {formatPrice(min)}
                <span className="text-muted-foreground">–</span>
                {formatPrice(max)}
              </>
            )}
            {p.compare_price && (
              <p className="text-[10px] text-muted-foreground line-through">
                {formatPrice(p.compare_price)}
              </p>
            )}
          </div>
        );
      },
    },
    {
      header: "Category",
      cell: (p) => (
        <span className="text-sm text-muted-foreground">{p.category?.name ?? "—"}</span>
      ),
    },
    {
      header: "Markets",
      cell: (p) => (
        <MarketChips
          countryIds={(p as AdminProductRow & { available_country_ids?: string[] }).available_country_ids}
        />
      ),
    },
    {
      header: "Updated",
      cell: (p) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(p.updated_at)}
        </span>
      ),
    },
    {
      header: "",
      align: "right",
      cell: (p) => (
        <QuickActions product={p} onDelete={() => onDelete(p.id)} />
      ),
    },
  ];
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: ProductFilters = {
  search: "",
  category: "all",
  status: "all",
  stock: "all",
  featured: "all",
};

export default function AdminProductsPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ProductFilters>(DEFAULT_FILTERS);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useAdminProducts(page);
  const { mutate: deleteProduct, isPending: isDeleting } = useAdminDeleteProduct();
  const { data: categoriesData = [] } = useCategories();

  const products = useMemo(
    () => (data?.data ?? []) as AdminProductRow[],
    [data?.data],
  );

  const filteredProducts = useMemo(
    () => filterProducts(products, filters),
    [products, filters],
  );

  const handleFiltersChange = useCallback(
    (f: ProductFilters) => {
      setFilters(f);
      setPage(1);
    },
    [],
  );

  const columns = useMemo(() => buildColumns(setDeleteId), []);

  const categories = categoriesData as Array<{ id: string; name: string }>;

  return (
    <div className="space-y-5">
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

      <ProductFilterBar
        filters={filters}
        onChange={handleFiltersChange}
        categories={categories}
        totalCount={products.length}
        filteredCount={filteredProducts.length}
      />

      <DataTable
        columns={columns}
        data={filteredProducts}
        keyFn={(p) => p.id}
        isLoading={isLoading}
        loadingText="Loading products…"
        emptyTitle="No products found"
        emptyDescription="Try adjusting your filters or create a new product."
        page={page}
        totalPages={data?.totalPages ?? 1}
        onPageChange={(p) => { setPage(p); }}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete Product"
        description="This action cannot be undone. The product and all its variants will be permanently removed."
        variant="destructive"
        confirmLabel="Delete"
        loading={isDeleting}
        onConfirm={() => {
          if (deleteId) deleteProduct(deleteId, { onSuccess: () => setDeleteId(null) });
        }}
      />
    </div>
  );
}
