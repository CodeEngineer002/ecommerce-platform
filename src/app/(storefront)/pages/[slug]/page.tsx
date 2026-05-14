import { redirect } from "next/navigation";

import { DEFAULT_COUNTRY, DEFAULT_LANGUAGE } from "@/lib/i18n/config";

// Bare /pages/{slug} redirects to the locale-prefixed route.
// Locale resolution happens in middleware; this catches any direct hits.
export default async function LegacyCmsPageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/${DEFAULT_COUNTRY}/${DEFAULT_LANGUAGE}/pages/${slug}`);
}
