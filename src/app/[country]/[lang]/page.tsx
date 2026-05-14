import { ArrowRight, ShieldCheck, Star, Truck, Zap } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ProductGrid } from "@/components/ecommerce/product-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deliverHomepageSections } from "@/features/cms/delivery/cms-delivery.server";
import { getCategories } from "@/features/products/services/category.service";
import { getFeaturedProducts } from "@/features/products/services/product.service";
import { APP_NAME } from "@/lib/constants";
import {
  COUNTRIES,
  LANGUAGES,
  isLanguageSupportedInCountry,
  isValidCountry,
  isValidLanguage,
  type CountryCode,
  type LanguageCode,
} from "@/lib/i18n/config";
import { buildLocaleRoutes } from "@/lib/i18n/routing";
import { buildLocalizedMetadata } from "@/lib/i18n/seo";
import { loadMessages } from "@/lib/i18n/translations";

interface Props {
  params: Promise<{ country: string; lang: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, lang } = await params;
  if (!isValidCountry(country) || !isValidLanguage(lang)) return {};

  return buildLocalizedMetadata({
    params: { country: country as CountryCode, lang: lang as LanguageCode },
    barePath: "/",
    title: APP_NAME,
    description: `${APP_NAME} — Shop in ${COUNTRIES[country as CountryCode].name}`,
  });
}

async function CategoriesSection({ country, lang }: { country: CountryCode; lang: LanguageCode }) {
  const categories = await getCategories();
  if (!categories.length) return null;
  const routes = buildLocaleRoutes({ country, lang });
  const messages = await loadMessages(lang);

  return (
    <section className="container space-y-6">
      <h2 className="text-2xl font-bold">{messages.home.shopByCategory}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {categories.slice(0, 5).map((cat) => (
          <Link
            key={cat.id}
            href={routes.category(cat.slug)}
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

async function FeaturedProductsSection({ country, lang }: { country: CountryCode; lang: LanguageCode }) {
  const products = await getFeaturedProducts(8);
  if (!products.length) return null;
  const routes = buildLocaleRoutes({ country, lang });
  const messages = await loadMessages(lang);

  return (
    <section className="container space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{messages.home.trending}</h2>
        <Button variant="outline" asChild>
          <Link href={`${routes.products}?featured=1`}>{messages.common.seeAll}</Link>
        </Button>
      </div>
      <ProductGrid products={products} />
    </section>
  );
}

export default async function LocaleHomePage({ params }: Props) {
  const { country: rawCountry, lang: rawLang } = await params;

  if (
    !isValidCountry(rawCountry) ||
    !isValidLanguage(rawLang) ||
    !isLanguageSupportedInCountry(rawLang as LanguageCode, rawCountry as CountryCode)
  ) {
    notFound();
  }

  const country = rawCountry as CountryCode;
  const lang = rawLang as LanguageCode;
  const routes = buildLocaleRoutes({ country, lang });
  const messages = await loadMessages(lang);
  const sections = await deliverHomepageSections(country, lang);

  const hero = sections.find((s) => s.type === "hero_banner");
  const heroContent = hero?.content as {
    cta_text?: string; cta_link?: string; image_url?: string; badge?: string;
  } | null;

  const dir = LANGUAGES[lang].dir;

  const trustItems = [
    { icon: Truck,       title: messages.home.freeShipping,   desc: messages.home.freeShippingDesc },
    { icon: ShieldCheck, title: messages.home.securePayment,  desc: messages.home.securePaymentDesc },
    { icon: Zap,         title: messages.home.fastDelivery,   desc: messages.home.fastDeliveryDesc },
    { icon: Star,        title: messages.home.topQuality,     desc: messages.home.topQualityDesc },
  ];

  return (
    <div className="space-y-16 pb-16" dir={dir}>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 to-brand-900 text-white">
        <div className="container relative z-10 flex min-h-[500px] flex-col items-start justify-center gap-6 py-16">
          {(hero?.title || heroContent?.badge) && (
            <div className="space-y-2">
              {heroContent?.badge && (
                <Badge className="bg-white/20 text-white hover:bg-white/30">{heroContent.badge}</Badge>
              )}
              <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                {hero?.title ?? APP_NAME}
              </h1>
              {hero?.subtitle && (
                <p className="max-w-lg text-lg text-white/80">{hero.subtitle}</p>
              )}
            </div>
          )}
          <Button size="xl" variant="secondary" asChild className="gap-2">
            <Link href={heroContent?.cta_link ?? routes.products}>
              {heroContent?.cta_text ?? messages.home.heroCta}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
        {heroContent?.image_url && (
          <div className="absolute inset-0 opacity-10">
            <Image src={heroContent.image_url} alt="Hero" fill className="object-cover" priority />
          </div>
        )}
      </section>

      {/* Trust indicators */}
      <section className="container">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {trustItems.map(({ icon: Icon, title, desc }) => (
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

      <Suspense fallback={<div className="container h-48 animate-pulse rounded-lg bg-muted" />}>
        <CategoriesSection country={country} lang={lang} />
      </Suspense>

      <Suspense fallback={<div className="container h-64 animate-pulse rounded-lg bg-muted" />}>
        <FeaturedProductsSection country={country} lang={lang} />
      </Suspense>

      {/* Promo banner */}
      <section className="bg-muted">
        <div className="container flex flex-col items-center gap-4 py-16 text-center">
          <Badge variant="brand" className="text-sm">{messages.home.newArrivals}</Badge>
          <h2 className="max-w-2xl text-3xl font-bold">
            {messages.home.newArrivals} — {COUNTRIES[country].name}
          </h2>
          <Button size="lg" asChild>
            <Link href={`${routes.products}?sort=newest`}>{messages.home.heroCta}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
