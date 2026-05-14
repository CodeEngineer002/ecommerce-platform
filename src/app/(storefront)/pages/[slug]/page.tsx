import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCmsPageServer, getCmsPagesServer } from "@/features/cms/services/cms.service.server";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const pages = await getCmsPagesServer();
  return pages
    .filter((p) => p.is_active)
    .map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getCmsPageServer(slug);
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

export default async function CmsPageRoute({ params }: Props) {
  const { slug } = await params;
  const page = await getCmsPageServer(slug);

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
