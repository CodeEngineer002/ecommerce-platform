import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getLocalizedCmsPageServer } from "@/features/cms/services/cms.localized.server";
import { isValidCountry, isValidLanguage, type CountryCode, type LanguageCode } from "@/lib/i18n/config";

interface Props {
  params: Promise<{ country: string; lang: string; slug: string }>;
}

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, lang, slug } = await params;
  if (!isValidCountry(country) || !isValidLanguage(lang)) return {};

  const page = await getLocalizedCmsPageServer(slug, country as CountryCode, lang as LanguageCode);
  if (!page) return {};

  return {
    title: page.seo_title ?? page.title,
    description: page.seo_desc ?? undefined,
    openGraph: {
      title: page.seo_title ?? page.title,
      description: page.seo_desc ?? undefined,
    },
  };
}

export default async function LocaleCmsPageRoute({ params }: Props) {
  const { country, lang, slug } = await params;

  if (!isValidCountry(country) || !isValidLanguage(lang)) notFound();

  const page = await getLocalizedCmsPageServer(slug, country as CountryCode, lang as LanguageCode);
  if (!page) notFound();

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {page.title}
      </h1>
      {page.content ? (
        <article
          className="prose prose-neutral max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: page.content }}
        />
      ) : (
        <p className="text-muted-foreground">No content available.</p>
      )}
    </main>
  );
}
