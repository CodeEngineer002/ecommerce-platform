import { ArrowRight, ShieldCheck, Star, Truck, Zap } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { FreeShippingNote } from "@/components/ecommerce/free-shipping-note";
import { ProductGrid } from "@/components/ecommerce/product-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { deliverHomepageSections } from "@/features/cms/delivery/cms-delivery.server";
import { getCategories } from "@/features/products/services/category.service";
import { getFeaturedProducts } from "@/features/products/services/product.service";
import { APP_NAME } from "@/lib/constants";
import { DEFAULT_COUNTRY, DEFAULT_LANGUAGE } from "@/lib/i18n/config";

export const metadata: Metadata = {
  title: "Home",
  description: `${APP_NAME} — Discover amazing products at unbeatable prices`,
};

// --- Async streaming sections ---

async function CategoriesSection() {
  const categories = await getCategories();
  if (!categories.length) return null;

  return (
    <section className="container space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Shop by Category</h2>
        <Link href="/products" className="flex items-center gap-1 text-sm text-primary hover:underline">
          View all <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {categories.slice(0, 5).map((cat) => (
          <Link
            key={cat.id}
            href={`/categories/${cat.slug}`}
            className="group flex flex-col items-center gap-2 rounded-lg border bg-card p-4 text-center transition-shadow hover:shadow-md"
          >
            {cat.image_url ? (
              <div className="relative h-16 w-16 overflow-hidden rounded-full bg-muted">
                <Image src={cat.image_url} alt={cat.name} fill className="object-cover" sizes="64px" />
              </div>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                {cat.name[0]}
              </div>
            )}
            <span className="text-sm font-medium group-hover:text-primary">{cat.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CategoriesSkeleton() {
  return (
    <div className="container space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

async function FeaturedProductsSection() {
  const featuredProducts = await getFeaturedProducts(8);
  if (!featuredProducts.length) return null;

  return (
    <section className="container space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Trending Now</h2>
          <p className="text-sm text-muted-foreground">Most loved products this week</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/products?featured=1">View All</Link>
        </Button>
      </div>
      <ProductGrid products={featuredProducts} />
    </section>
  );
}

function FeaturedProductsSkeleton() {
  return (
    <div className="container space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
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

// --- Page ---

export default async function HomePage() {
  const sections = await deliverHomepageSections(DEFAULT_COUNTRY, DEFAULT_LANGUAGE);

  const hero = sections.find((s) => s.type === "hero_banner");
  const heroContent = hero?.content as { cta_text?: string; cta_link?: string; image_url?: string; badge?: string } | null;

  return (
    <div className="space-y-16 pb-16">
      {/* Hero — rendered synchronously with CMS data */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 to-brand-900 text-white">
        <div className="container relative z-10 flex min-h-[500px] flex-col items-start justify-center gap-6 py-16">
          {(hero?.title || heroContent?.badge) && (
            <div className="space-y-2">
              {heroContent?.badge && (
                <Badge className="bg-white/20 text-white hover:bg-white/30">
                  {heroContent.badge}
                </Badge>
              )}
              <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                {hero?.title ?? "Summer Sale is Here"}
              </h1>
              {hero?.subtitle && (
                <p className="max-w-lg text-lg text-white/80">{hero.subtitle}</p>
              )}
            </div>
          )}
          <Button size="xl" variant="secondary" asChild className="gap-2">
            <Link href={heroContent?.cta_link ?? "/products"}>
              {heroContent?.cta_text ?? "Shop Now"}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
        {heroContent?.image_url && (
          <div className="absolute inset-0 opacity-10">
            <Image
              src={heroContent.image_url}
              alt="Hero"
              fill
              className="object-cover"
              priority
            />
          </div>
        )}
      </section>

      {/* Trust indicators — static, no DB needed */}
      <section className="container">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { icon: Truck, title: "Free Shipping", desc: <FreeShippingNote variant="short" /> },
            { icon: ShieldCheck, title: "Secure Payment", desc: "100% safe checkout" },
            { icon: Zap, title: "Fast Delivery", desc: "2-5 business days" },
            { icon: Star, title: "Top Quality", desc: "Curated products" },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 rounded-lg border p-4">
              <div className="shrink-0 rounded-md bg-primary/10 p-2">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories — streamed independently */}
      <Suspense fallback={<CategoriesSkeleton />}>
        <CategoriesSection />
      </Suspense>

      {/* Featured products — streamed independently */}
      <Suspense fallback={<FeaturedProductsSkeleton />}>
        <FeaturedProductsSection />
      </Suspense>

      {/* Promo banner — static */}
      <section className="bg-muted">
        <div className="container flex flex-col items-center gap-4 py-16 text-center">
          <Badge variant="brand" className="text-sm">New Arrivals</Badge>
          <h2 className="max-w-2xl text-3xl font-bold">Discover Our Latest Collection</h2>
          <p className="max-w-lg text-muted-foreground">
            Fresh styles and innovative products added every week. Be the first to discover what&apos;s new.
          </p>
          <Button size="lg" asChild>
            <Link href="/products?sort=newest">Browse New Arrivals</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
