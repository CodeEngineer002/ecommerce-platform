// /admin/cms/[country] — redirect to default language for this country
import { redirect } from "next/navigation";

import { COUNTRIES, isValidCountry } from "@/lib/i18n/config";

interface Props {
  params: Promise<{ country: string }>;
}

export default async function AdminCmsCountryPage({ params }: Props) {
  const { country } = await params;
  const safeCountry = isValidCountry(country) ? country : "in";
  const defaultLang = COUNTRIES[safeCountry].defaultLang;
  redirect(`/admin/cms/${safeCountry}/${defaultLang}/homepage`);
}
