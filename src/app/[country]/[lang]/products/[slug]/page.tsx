import { Star, Truck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FreeShippingNote } from "@/components/ecommerce/free-shipping-note";
import { PriceDisplay } from "@/components/ecommerce/price-display";
import { ProductDetailClient } from "@/components/ecommerce/product-detail-client";
import { ProductGrid } from "@/components/ecommerce/product-grid";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProductBySlug, getRelatedProducts } from "@/features/products/services/product.service";
import { APP_NAME } from "@/lib/constants";
import { isValidCountry, isValidLanguage, type CountryCode, type LanguageCode } from "@/lib/i18n/config";
import { buildLocaleRoutes, type LocaleParams } from "@/lib/i18n/routing";

interface Props {
  params: Promise<{ country: string; lang: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };

  return {
    title: product.seo_title ?? product.name,
    description: product.seo_desc ?? product.short_desc ?? undefined,
    openGraph: {
      title: product.name,
      description: product.short_desc ?? undefined,
      images: product.images[0] ? [{ url: product.images[0].url }] : [],
      siteName: APP_NAME,
    },
  };
}

async function RelatedProducts({ productId, categoryId }: { productId: string; categoryId: string | null }) {
  const related = await getRelatedProducts(productId, categoryId, 4);
  if (!related.length) return null;
  return (
    <section className="mt-16 space-y-4">
      <h2 className="text-xl font-bold">You May Also Like</h2>
      <ProductGrid products={related} />
    </section>
  );
}

function RelatedProductsSkeleton() {
  return (
    <div className="mt-16 space-y-4">
      <Skeleton className="h-7 w-40" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card">
            <Skeleton className="aspect-square rounded-t-lg rounded-b-none" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-5 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function LocaleProductDetailPage({ params }: Props) {
  const { country, lang, slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const localeParams: LocaleParams = isValidCountry(country) && isValidLanguage(lang)
    ? { country: country as CountryCode, lang: lang as LanguageCode }
    : { country: "in", lang: "en" };
  const routes = buildLocaleRoutes(localeParams);

  const inStock = product.variants.some(
    (v) => v.is_active && (v.inventory?.quantity ?? 0) > 0
  );

  return (
    <div className="container py-8">
      {/*
        ProductDetailClient owns selectedVariantId so gallery and add-to-cart
        share a single source of truth. Static metadata is passed as children
        (server-rendered) and placed above the interactive controls.
      */}
      <ProductDetailClient product={product}>
        {product.category && (
          <a
            href={routes.category(product.category.slug)}
            className="text-sm text-muted-foreground hover:text-primary"
          >
            {product.category.name}
          </a>
        )}

        <div className="space-y-2">
          <h1 className="text-3xl font-bold">{product.name}</h1>
          {product.avg_rating && (
            <div className="flex items-center gap-2">
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${
                      i < Math.round(product.avg_rating!)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300"
                    }`}
                  />
                ))}
              </div>
              <span className="text-sm text-muted-foreground">
                {product.avg_rating} ({product.review_count ?? 0} reviews)
              </span>
            </div>
          )}
        </div>

        <PriceDisplay
          price={product.base_price}
          comparePrice={product.compare_price}
          size="lg"
        />

        {product.short_desc && (
          <p className="text-muted-foreground">{product.short_desc}</p>
        )}

        {(product.tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {(product.tags ?? []).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {inStock ? (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            In Stock
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            Out of Stock
          </div>
        )}

        <Separator />

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Truck className="h-4 w-4 shrink-0" />
          <FreeShippingNote />
        </div>
      </ProductDetailClient>

      <div className="mt-12">
        <Tabs defaultValue="description">
          <TabsList>
            <TabsTrigger value="description">Description</TabsTrigger>
            <TabsTrigger value="shipping">Shipping & Returns</TabsTrigger>
          </TabsList>
          <TabsContent value="description" className="mt-4 max-w-3xl">
            {product.description ? (
              <div className="prose prose-sm max-w-none text-muted-foreground">
                {product.description}
              </div>
            ) : (
              <p className="text-muted-foreground">No description available.</p>
            )}
          </TabsContent>
          <TabsContent value="shipping" className="mt-4 max-w-3xl text-sm text-muted-foreground">
            <ul className="list-inside list-disc space-y-2">
              <li><FreeShippingNote /></li>
              <li>Standard delivery: 3-5 business days</li>
              <li>Express delivery: 1-2 business days (extra charges apply)</li>
              <li>Easy 7-day returns on all products</li>
            </ul>
          </TabsContent>
        </Tabs>
      </div>

      <Suspense fallback={<RelatedProductsSkeleton />}>
        <RelatedProducts productId={product.id} categoryId={product.category_id} />
      </Suspense>
    </div>
  );
}
