// Legacy /admin/cms/banners — redirects to country-first CMS URL
import { redirect } from "next/navigation";
import { COUNTRIES } from "@/lib/i18n/config";
const DEFAULT_COUNTRY = "in";
const DEFAULT_LANG = COUNTRIES[DEFAULT_COUNTRY].defaultLang;
export default function AdminCmsLegacy_banners() {
  redirect(`/admin/cms/${DEFAULT_COUNTRY}/${DEFAULT_LANG}/banners`);
}
