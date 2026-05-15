"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Upload, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { useForm } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/feedback/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAdminProduct,
  useAdminUpdateProduct,
  useDeleteProductImage,
  useUploadProductImage,
} from "@/features/admin/hooks/use-admin-products";
import { useAllCountries } from "@/features/admin/hooks/use-country-management";
import { useCategories } from "@/features/products/hooks/use-categories";
import { ROUTES } from "@/lib/constants";
import { productSchema, type ProductFormData } from "@/lib/validators";
import type { ProductImage } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default function EditProductPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { data: product, isLoading } = useAdminProduct(id);
  const { data: categoriesData = [] } = useCategories();
  const categories = categoriesData;
  const { data: allCountries = [] } = useAllCountries();
  const { mutate: updateProduct, isPending } = useAdminUpdateProduct();
  const { mutate: uploadImage, isPending: isUploading } = useUploadProductImage();
  const { mutate: deleteImage } = useDeleteProductImage();

  // Country availability state (not part of react-hook-form to keep it simple)
  const productAny = product as (typeof product & { available_country_ids?: string[] }) | undefined;
  const [selectedCountryIds, setSelectedCountryIds] = useState<string[]>(
    productAny?.available_country_ids ?? []
  );

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<ProductFormData>({
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
          sku: product.sku ?? "",
          tags: product.tags ?? [],
          is_active: product.is_active,
          is_featured: product.is_featured,
          seo_title: product.seo_title ?? "",
          seo_desc: product.seo_desc ?? "",
        }
      : undefined,
  });

  if (isLoading) return <LoadingState text="Loading product…" />;
  if (!product) return <p>Product not found</p>;

  const images =
    (product as typeof product & { images?: ProductImage[] }).images ?? [];

  const onSubmit = (data: ProductFormData) => {
    updateProduct(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id, data: { ...data, available_country_ids: selectedCountryIds } as any },
      { onSuccess: () => router.push(ROUTES.admin.products) }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Product"
        action={
          <Button variant="outline" asChild>
            <Link href={ROUTES.admin.products}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Images */}
            <Card>
              <CardHeader>
                <CardTitle>Images</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="group relative h-24 w-24 overflow-hidden rounded-lg border bg-muted"
                    >
                      <Image
                        src={img.url}
                        alt={img.alt_text ?? ""}
                        fill
                        className="object-cover"
                        sizes="96px"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          deleteImage({ imageId: img.id, url: img.url, productId: id })
                        }
                        className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-5 w-5 text-white" />
                      </button>
                    </div>
                  ))}
                  <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-muted/50 hover:bg-muted">
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadImage({ productId: id, file });
                      }}
                    />
                    {isUploading ? (
                      <span className="text-xs text-muted-foreground">Uploading…</span>
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-muted-foreground" />
                        <span className="mt-1 text-xs text-muted-foreground">Upload</span>
                      </>
                    )}
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Basic info */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField label="Product Name" required error={errors.name} {...register("name")} />
                <FormField label="Slug" required error={errors.slug} {...register("slug")} />
                <FormField label="Short Description" as="textarea" {...register("short_desc")} />
                <FormField
                  label="Full Description"
                  as="textarea"
                  rows={6}
                  {...register("description")}
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  label="Price (₹)"
                  type="number"
                  required
                  error={errors.base_price}
                  {...register("base_price", { valueAsNumber: true })}
                />
                <FormField
                  label="Compare Price (₹)"
                  type="number"
                  {...register("compare_price", { valueAsNumber: true })}
                />
                <FormField label="SKU" {...register("sku")} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Organisation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select
                    defaultValue={product.category_id ?? ""}
                    onValueChange={(v) => setValue("category_id", v)}
                  >
                    <SelectTrigger>
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
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is_active"
                    defaultChecked={product.is_active}
                    onCheckedChange={(v) => setValue("is_active", !!v)}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is_featured"
                    defaultChecked={product.is_featured}
                    onCheckedChange={(v) => setValue("is_featured", !!v)}
                  />
                  <Label htmlFor="is_featured">Featured</Label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>SEO</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  label="SEO Title"
                  placeholder="Max 60 chars"
                  error={errors.seo_title}
                  {...register("seo_title")}
                />
                <FormField
                  label="SEO Description"
                  as="textarea"
                  placeholder="Max 160 chars"
                  error={errors.seo_desc}
                  {...register("seo_desc")}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Country Availability</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-xs text-muted-foreground">
                  Select countries where this product is available.
                  <strong className="text-foreground"> Leave all unchecked = available in all countries.</strong>
                </p>
                {selectedCountryIds.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {selectedCountryIds.map((cid) => {
                      const c = allCountries.find((x) => x.id === cid);
                      return (
                        <Badge key={cid} variant="secondary" className="text-xs">
                          {c?.name ?? cid}
                        </Badge>
                      );
                    })}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {allCountries.map((country) => {
                    const checked = selectedCountryIds.includes(country.id);
                    return (
                      <label
                        key={country.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md border p-2 hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setSelectedCountryIds((prev) =>
                              v ? [...prev, country.id] : prev.filter((x) => x !== country.id)
                            );
                          }}
                        />
                        <span className="text-sm">{country.name}</span>
                      </label>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" loading={isPending}>
              Save Changes
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
