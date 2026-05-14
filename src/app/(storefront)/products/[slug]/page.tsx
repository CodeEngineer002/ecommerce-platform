import { Heart, ShoppingCart, Star, Truck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductGallery } from "@/components/ecommerce/product-gallery";
import { PriceDisplay } from "@/components/ecommerce/price-display";
import { ProductGrid } from "@/components/ecommerce/product-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_NAME } from "@/lib/constants";
import { getProductBySlug, getRelatedProducts } from "@/features/products/services/product.service";
import { AddToCartSection } from "./add-to-cart-section";

interface Props {
  params: Promise<{ slug: string }>;
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

export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = await getRelatedProducts(product.id, product.category_id, 4);

  const inStock = product.variants.some(
    (v) => v.is_active && (v.inventory?.quantity ?? 0) > 0
  );

  return (
    <div className="container py-8">
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Gallery */}
        <ProductGallery images={product.images} productName={product.name} />

        {/* Info */}
        <div className="space-y-6">
          {/* Breadcrumb category */}
          {product.category && (
            <a
              href={`/categories/${product.category.slug}`}
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

          {/* Tags */}
          {product.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {product.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Stock status */}
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

          {/* Add to cart */}
          <AddToCartSection product={product} />

          <Separator />

          {/* Shipping note */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Truck className="h-4 w-4 shrink-0" />
            Free shipping on orders above ₹999
          </div>
        </div>
      </div>

      {/* Description tabs */}
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
              <li>Free shipping on orders above ₹999</li>
              <li>Standard delivery: 3-5 business days</li>
              <li>Express delivery: 1-2 business days (extra charges apply)</li>
              <li>Easy 7-day returns on all products</li>
            </ul>
          </TabsContent>
        </Tabs>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-16 space-y-4">
          <h2 className="text-xl font-bold">You May Also Like</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
