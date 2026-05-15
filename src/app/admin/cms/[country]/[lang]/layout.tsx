// /admin/cms/[country]/[lang]/layout.tsx
// Country-first CMS layout: renders 3-tier navigation (country → language → module)
// then the module content as children.

import { redirect } from "next/navigation";

import { CmsCountryNav } from "@/components/cms/cms-country-nav";
import { COUNTRIES, isValidCountry, isValidLanguage } from "@/lib/i18n/config";

interface Props {
  children: React.ReactNode;
  params: Promise<{ country: string; lang: string }>;
}

export default async function CmsCountryLangLayout({ children, params }: Props) {
  const { country, lang } = await params;

  // Validate country
  if (!isValidCountry(country)) {
    redirect(`/admin/cms/in/${COUNTRIES.in.defaultLang}/homepage`);
  }

  // Validate language is supported for this country
  if (!isValidLanguage(lang) || !COUNTRIES[country].supportedLangs.includes(lang as never)) {
    redirect(`/admin/cms/${country}/${COUNTRIES[country].defaultLang}/homepage`);
  }

  return (
    <div className="space-y-6">
      {/* 3-tier country-first navigation */}
      <CmsCountryNav />

      {/* Module content */}
      {children}
    </div>
  );
}
