import type { MetadataRoute } from "next";

import { getCategories } from "@/features/products/services/category.service";
import { getProducts } from "@/features/products/services/product.service";
import { APP_URL } from "@/lib/constants";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ data: products }, categories] = await Promise.all([
    getProducts({ pageSize: 1000 }),
    getCategories(),
  ]);

  const productUrls = products.map((p) => ({
    url: `${APP_URL}/products/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const categoryUrls = categories.map((c) => ({
    url: `${APP_URL}/categories/${c.slug}`,
    lastModified: new Date(c.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [
    { url: APP_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${APP_URL}/products`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    ...categoryUrls,
    ...productUrls,
  ];
}
