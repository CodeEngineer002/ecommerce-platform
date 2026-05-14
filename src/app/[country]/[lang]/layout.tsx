import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CartDrawer } from "@/components/ecommerce/cart-drawer";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { CartHydrationProvider } from "@/features/cart/cart-hydration-provider";
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
import { getRegionConfig } from "@/lib/i18n/region-config";
import { createClient } from "@/lib/supabase/server";

interface Props {
  children: React.ReactNode;
  params: Promise<{ country: string; lang: string }>;
}

export async function generateStaticParams() {
  const params: Array<{ country: string; lang: string }> = [];
  for (const country of Object.values(COUNTRIES)) {
    for (const lang of country.supportedLangs as LanguageCode[]) {
      params.push({ country: country.id, lang });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, lang } = await params;
  if (!isValidCountry(country) || !isValidLanguage(lang)) return {};

  const regionCfg = getRegionConfig(country as CountryCode);
  const langCfg = LANGUAGES[lang as LanguageCode];

  return {
    title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
    description: `${APP_NAME} — ${COUNTRIES[country as CountryCode].name}`,
    other: {
      "og:locale": `${langCfg.bcp47}_${COUNTRIES[country as CountryCode].iso}`,
      currency: regionCfg.currencyCode,
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { country, lang } = await params;

  if (
    !isValidCountry(country) ||
    !isValidLanguage(lang) ||
    !isLanguageSupportedInCountry(lang as LanguageCode, country as CountryCode)
  ) {
    notFound();
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  const navUser = user
    ? {
        id: user.id,
        email: user.email,
        full_name: profile?.full_name ?? undefined,
        avatar_url: profile?.avatar_url ?? undefined,
      }
    : null;

  return (
    <CartHydrationProvider>
      <div className="flex min-h-screen flex-col">
        <Navbar user={navUser} />
        <main className="flex-1">{children}</main>
        <Footer />
        <CartDrawer />
      </div>
    </CartHydrationProvider>
  );
}
