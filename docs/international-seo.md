# International SEO

## hreflang Implementation

Every localized page must include hreflang tags so Google understands the multi-language/multi-region structure.

### Usage

```typescript
import { buildLocalizedMetadata } from "@/lib/i18n/seo";

export async function generateMetadata({ params }) {
  const { country, lang } = await params;
  return buildLocalizedMetadata({
    params: { country, lang },
    barePath: "/products/my-laptop",
    title: "My Laptop | ShopNest",
    description: "Buy the best laptop...",
  });
}
```

This generates:
```html
<link rel="canonical" href="https://shopnest.com/de/de/products/my-laptop" />
<link rel="alternate" hreflang="de"    href="https://shopnest.com/de/de/products/my-laptop" />
<link rel="alternate" hreflang="en-DE" href="https://shopnest.com/de/en/products/my-laptop" />
<link rel="alternate" hreflang="en"    href="https://shopnest.com/us/en/products/my-laptop" />
<link rel="alternate" hreflang="hi"    href="https://shopnest.com/in/hi/products/my-laptop" />
<link rel="alternate" hreflang="ar"    href="https://shopnest.com/ae/ar/products/my-laptop" />
<!-- ... all other locales ... -->
<link rel="alternate" hreflang="x-default" href="https://shopnest.com/" />
```

## hreflang Tag Rules

| Rule | Implementation |
|------|---------------|
| Each page points to ALL variants | `buildHreflangEntries()` iterates all country × lang combinations |
| `x-default` required | Points to `/` (middleware redirects to detected locale) |
| Self-reference required | The current page must include itself in the set |
| Canonical = current URL | Set via `alternates.canonical` |

## URL Structure for SEO

```
Good: /de/de/products/laptop-pro-2024
       ↑  ↑  semantic path segments
       country lang

Good: /in/en/categories/electronics

Avoid: /products/laptop-pro-2024?lang=de&country=de  ← not crawlable as separate URLs
```

## Localized Metadata Strategy

### Title Tags
- Use locale-specific `seo_title` from `localized_seo` table if set
- Fall back to `title` field from `localized_cms_pages`
- Append `| {APP_NAME}` via Next.js title template

### Meta Description
- Max 160 characters
- Store in `localized_seo.description` per locale
- Reuse the `seo_desc` from localized pages

### Open Graph
- `og:locale` = `de_DE`, `hi_IN`, `ar_AE` (ISO format with underscore)
- `og:site_name` = app name
- Each variant has its own canonical OG URL

## Sitemap

Use `buildSitemapEntries()` in `src/app/sitemap.ts`:

```typescript
import { buildSitemapEntries } from "@/lib/i18n/seo";

export default async function sitemap() {
  const productPaths = products.map(p => ({
    barePath: `/products/${p.slug}`,
    priority: 0.8
  }));

  return buildSitemapEntries(productPaths);
  // Generates one entry per barePath × locale combination
}
```

## Structured Data

Use `buildBreadcrumbJsonLd()` for breadcrumb rich results:

```typescript
const jsonLd = buildBreadcrumbJsonLd({ country: 'de', lang: 'de' }, [
  { name: 'Home', path: '/' },
  { name: 'Electronics', path: '/categories/electronics' },
  { name: 'Laptop Pro', path: '/products/laptop-pro' },
]);
```

## Duplicate Content Prevention

- Each locale is a distinct URL → no duplicate content issue
- Canonical tags prevent Google from choosing wrong URLs
- hreflang signals which content is for which audience
- `x-default` handles undetermined locale traffic
