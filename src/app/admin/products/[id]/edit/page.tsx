"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft, DollarSign, Globe, Image as ImageIcon, Layers,
  LayoutGrid, PackageSearch, Ruler, Save, Search,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useState } from "react";
import { useForm } from "react-hook-form";

import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/feedback/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAdminProduct,
  useAdminUpdateProduct,
} from "@/features/admin/hooks/use-admin-products";
import { useAllCountries } from "@/features/admin/hooks/use-country-management";
import { useCategories } from "@/features/products/hooks/use-categories";
import { ROUTES } from "@/lib/constants";
import { productSchema, type ProductFormData } from "@/lib/validators";
import type { ProductImage } from "@/types";
import { computeProductStatus, STATUS_CONFIG, type AdminVariant } from "../../catalog-utils";

import { InventorySection } from "../../_components/inventory-section";
import { MediaSection } from "../../_components/media-section";
import { OverviewSection } from "../../_components/overview-section";
import { PricingSection } from "../../_components/pricing-section";
import { PublishingSection } from "../../_components/publishing-section";
import { SeoSection } from "../../_components/seo-section";
import { ShippingSection } from "../../_components/shipping-section";
import { VariantsSection } from "../../_components/variants-section";

interface Props {
  params: Promise<{ id: string }>;
}

type ShippingExtras = {
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  fulfillment_type?: string | null;
  tax_class?: string | null;
  is_returnable?: boolean;
};

export default function EditProductPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const { data: product, isLoading } = useAdminProduct(id);
  const { data: categoriesData = [] } = useCategories();
  const { data: allCountries = [] } = useAllCountries();
  const { mutate: updateProduct, isPending } = useAdminUpdateProduct();

  const productAny = product as (typeof product & {
    available_country_ids?: string[];
    product_code?: string | null;
    deleted_at?: string | null;
  }) | undefined;

  const productExtended = product as (typeof product & ShippingExtras) | undefined;

  // Country availability
  const [selectedCountryIds, setSelectedCountryIds] = useState<string[]>(
    productAny?.available_country_ids ?? [],
  );

  // Shipping extras (migration 00027 fields)
  const [shippingExtras, setShippingExtras] = useState<ShippingExtras>({
    length_cm: productExtended?.length_cm ?? null,
    width_cm: productExtended?.width_cm ?? null,
    height_cm: productExtended?.height_cm ?? null,
    fulfillment_type: productExtended?.fulfillment_type ?? "standard",
    tax_class: productExtended?.tax_class ?? null,
    is_returnable: productExtended?.is_returnable ?? true,
  });

  const handleShippingChange = useCallback(
    (field: keyof ShippingExtras, value: unknown) => {
      setShippingExtras((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const { register, handleSubmit, setValue, watch, formState: { errors, isDirty } } =
    useForm<ProductFormData>({
      resolver: zodResolver(productSchema),
      values: product
        ? {
            name: product.name,
            slug: product.slug,
            description: product.description ?? "",
            short_desc: product.short_desc ?? "",
            category_id: product.category_id ?? undefined,
            base_price: product.base_price,
            compare_price: product.compare_price ?? undefined,
            product_code: productAny?.product_code ?? "",
            sku: product.sku ?? "",
            tags: product.tags ?? [],
            is_active: product.is_active,
            is_featured: product.is_featured,
            seo_title: product.seo_title ?? "",
            seo_desc: product.seo_desc ?? "",
          }
        : undefined,
    });

  const isActive = watch("is_active");
  const isFeatured = watch("is_featured");
  const productName = watch("name") ?? "";

  if (isLoading) return <LoadingState text="Loading product…" />;
  if (!product) return <p className="p-8 text-muted-foreground">Product not found.</p>;

  const images = (product as typeof product & { images?: ProductImage[] }).images ?? [];
  const variants = (product as typeof product & { variants?: AdminVariant[] }).variants ?? [];
  const status = computeProductStatus(product.is_active, productAny?.deleted_at);
  const statusCfg = STATUS_CONFIG[status];
  const categories = categoriesData as Array<{ id: string; name: string }>;

  const onSubmit = (data: ProductFormData) => {
    updateProduct(
      {
        id,
        data: {
          ...data,
          available_country_ids: selectedCountryIds,
          ...shippingExtras,
        } as Parameters<typeof updateProduct>[0]["data"],
      },
      { onSuccess: () => router.push(ROUTES.admin.products) },
    );
  };

  const variantBadge = variants.length > 0
    ? `${variants.length} variant${variants.length !== 1 ? "s" : ""}`
    : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <span className="truncate max-w-sm">{productName || "Edit Product"}</span>
            <Badge variant={statusCfg.variant} className="text-xs shrink-0">
              {statusCfg.label}
            </Badge>
            {productAny?.product_code && (
              <code className="hidden sm:inline rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                {productAny.product_code}
              </code>
            )}
          </div>
        }
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={ROUTES.admin.products}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Link>
            </Button>
            <Button
              type="button"
              onClick={handleSubmit(onSubmit)}
              loading={isPending}
              disabled={!isDirty && selectedCountryIds === (productAny?.available_country_ids ?? [])}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Category selection — persisted outside tabs since it's a core attribute */}
        <div className="mb-4 flex items-center gap-3">
          <Label className="text-sm font-medium shrink-0">Category</Label>
          <Select
            defaultValue={product.category_id ?? ""}
            onValueChange={(v) => setValue("category_id", v)}
          >
            <SelectTrigger className="h-9 w-56">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {variantBadge && (
            <Badge variant="outline" className="text-xs">
              <Layers className="mr-1 h-3 w-3" />
              {variantBadge}
            </Badge>
          )}
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" className="gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="media" className="gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" />
              Media
              {images.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] py-0 px-1">
                  {images.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="variants" className="gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              Variants
              {variants.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] py-0 px-1">
                  {variants.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="inventory" className="gap-1.5">
              <PackageSearch className="h-3.5 w-3.5" />
              Inventory
            </TabsTrigger>
            <TabsTrigger value="pricing" className="gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              Pricing
            </TabsTrigger>
            <TabsTrigger value="seo" className="gap-1.5">
              <Search className="h-3.5 w-3.5" />
              SEO
            </TabsTrigger>
            <TabsTrigger value="publishing" className="gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Publishing
            </TabsTrigger>
            <TabsTrigger value="shipping" className="gap-1.5">
              <Ruler className="h-3.5 w-3.5" />
              Shipping
            </TabsTrigger>
          </TabsList>

          {/* ── Overview ─────────────────────────────────────────────────── */}
          <TabsContent value="overview">
            <OverviewSection
              register={register}
              errors={errors}
              onNameChange={(name) => {
                if (!watch("slug")) {
                  setValue(
                    "slug",
                    name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
                  );
                }
              }}
            />
          </TabsContent>

          {/* ── Media ────────────────────────────────────────────────────── */}
          <TabsContent value="media">
            <MediaSection
              productId={id}
              images={images}
              variants={variants}
            />
          </TabsContent>

          {/* ── Variants ─────────────────────────────────────────────────── */}
          <TabsContent value="variants">
            <VariantsSection
              productId={id}
              variants={variants}
              productImages={images}
            />
          </TabsContent>

          {/* ── Inventory ────────────────────────────────────────────────── */}
          <TabsContent value="inventory">
            <InventorySection
              productId={id}
              productCode={productAny?.product_code}
              variants={variants}
            />
          </TabsContent>

          {/* ── Pricing ──────────────────────────────────────────────────── */}
          <TabsContent value="pricing">
            <PricingSection register={register} errors={errors} />
          </TabsContent>

          {/* ── SEO ──────────────────────────────────────────────────────── */}
          <TabsContent value="seo">
            <SeoSection
              register={register}
              errors={errors}
              defaultTitle={watch("seo_title") ?? ""}
              defaultDesc={watch("seo_desc") ?? ""}
            />
          </TabsContent>

          {/* ── Publishing ───────────────────────────────────────────────── */}
          <TabsContent value="publishing">
            <PublishingSection
              allCountries={allCountries}
              selectedCountryIds={selectedCountryIds}
              onCountryChange={setSelectedCountryIds}
              isActive={isActive ?? false}
              isFeatured={isFeatured ?? false}
              onActiveChange={(v) => setValue("is_active", v, { shouldDirty: true })}
              onFeaturedChange={(v) => setValue("is_featured", v, { shouldDirty: true })}
            />
          </TabsContent>

          {/* ── Shipping ─────────────────────────────────────────────────── */}
          <TabsContent value="shipping">
            <ShippingSection
              register={register}
              shippingValues={shippingExtras}
              onShippingChange={handleShippingChange}
            />
          </TabsContent>
        </Tabs>

        {/* Sticky save bar */}
        <div className="mt-6 flex justify-end">
          <Button type="submit" loading={isPending} className="gap-2 px-8">
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
