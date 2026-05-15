// /admin/cms/[country]/[lang] — redirect to homepage module
import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ country: string; lang: string }>;
}

export default async function AdminCmsLocalePage({ params }: Props) {
  const { country, lang } = await params;
  redirect(`/admin/cms/${country}/${lang}/homepage`);
}
