import type { MetadataRoute } from "next";

import { APP_URL } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/profile", "/orders", "/checkout"],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
