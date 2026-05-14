"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminCreateProduct } from "@/features/admin/hooks/use-admin-products";
import { useCategories } from "@/features/products/hooks/use-categories";
import { ROUTES } from "@/lib/constants";
import { slugify } from "@/lib/utils";
import { productSchema, type ProductFormData } from "@/lib/validators";

export default function NewProductPage() {
  const router = useRouter();
  const { mutate: createProduct, isPending } = useAdminCreateProduct();
  const { data: categories = [] } = useCategories();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: { is_active: true, is_featured: false, tags: [] },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Product"
        action={
          <Button variant="outline" asChild>
            <Link href={ROUTES.admin.products}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />

      <form
        onSubmit={handleSubmit((data) =>
          createProduct(data, { onSuccess: () => router.push(ROUTES.admin.products) })
        )}
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  label="Product Name"
                  required
                  error={errors.name}
                  {...register("name", {
                    onChange: (e) => setValue("slug", slugify(e.target.value)),
                  })}
                />
                <FormField
                  label="Slug"
                  required
                  error={errors.slug}
                  description="URL-friendly identifier"
                  {...register("slug")}
                />
                <FormField
                  label="Short Description"
                  as="textarea"
                  error={errors.short_desc}
                  {...register("short_desc")}
                />
                <FormField
                  label="Full Description"
                  as="textarea"
                  rows={6}
                  {...register("description")}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>SEO</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField label="SEO Title" description="Max 60 chars" {...register("seo_title")} />
                <FormField label="Meta Description" as="textarea" description="Max 160 chars" {...register("seo_desc")} />
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
                  description="Original price before discount"
                  error={errors.compare_price}
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
                  <Select onValueChange={(v) => setValue("category_id", v)}>
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
                    defaultChecked
                    onCheckedChange={(v) => setValue("is_active", !!v)}
                  />
                  <Label htmlFor="is_active">Active (visible on store)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is_featured"
                    onCheckedChange={(v) => setValue("is_featured", !!v)}
                  />
                  <Label htmlFor="is_featured">Featured product</Label>
                </div>
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" loading={isPending}>
              Create Product
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
