# Locale Routing

## URL Structure

```
/{country}/{lang}/{path}

Examples:
  /us/en/products
  /uk/en/products/laptop-pro
  /de/de/products
  /de/en/cart
  /in/hi/checkout
  /in/en/orders/abc-123
  /ae/ar/categories/electronics
  /ae/en/pages/about-us
```

## Middleware Behavior

The middleware at `src/middleware.ts` runs on every request:

1. **Admin/API/Auth paths** → skipped (no locale handling)
2. **`/{country}/{lang}/...`** → validates combination, sets locale headers/cookies
3. **`/`** → detects locale, redirects to `/{country}/{lang}/`
4. **All other paths** → passed through (Phase 2 will migrate these)

### Locale Detection Priority

```
1. URL params          (/de/de/ → de-DE)
2. Cookie preference   (from previous visit)
3. Geo/IP headers      (Cloudflare cf-ipcountry, Vercel x-vercel-ip-country)
4. Accept-Language     (browser header, parsed to nearest country)
5. Default             (India + English)
```

### Request Headers Set by Middleware

| Header | Example Value |
|--------|--------------|
| `x-country` | `de` |
| `x-language` | `de` |
| `x-locale-id` | `de-DE` |
| `x-text-direction` | `ltr` |

### Cookies Persisted

| Cookie | Value | TTL |
|--------|-------|-----|
| `x-locale-pref` | `de-DE` | 1 year |
| `x-country-pref` | `de` | 1 year |
| `x-lang-pref` | `de` | 1 year |

## App Router Structure

```
src/app/
  [country]/
    [lang]/
      layout.tsx      ← validates locale, sets html lang+dir, provides fonts
      page.tsx        ← localized homepage
      products/       ← (Phase 2 migration)
        page.tsx
        [slug]/
          page.tsx
      categories/     ← (Phase 2)
      cart/           ← (Phase 2)
      checkout/       ← (Phase 2)
      orders/         ← (Phase 2)
      pages/          ← localized CMS pages
        [slug]/
          page.tsx
  (storefront)/       ← existing routes (migrating in Phase 2)
  admin/              ← not localized
```

## Locale-Aware Route Building

Use `buildLocaleRoutes()` in any Server Component to generate prefixed links:

```typescript
import { buildLocaleRoutes } from "@/lib/i18n/routing";

const routes = buildLocaleRoutes({ country: 'de', lang: 'de' });

routes.home           // '/de/de'
routes.products       // '/de/de/products'
routes.product('slug')// '/de/de/products/slug'
routes.cart           // '/de/de/cart'
routes.page('about')  // '/de/de/pages/about'
```

## Language Switcher

```typescript
import { buildAlternates } from "@/lib/i18n/routing";

const alternates = buildAlternates(currentPath, { country: 'de', lang: 'de' });
// [
//   { country: 'de', lang: 'de', href: '/de/de/products', label: 'German', nativeLabel: 'Deutsch' },
//   { country: 'de', lang: 'en', href: '/de/en/products', label: 'English', nativeLabel: 'English' },
// ]
```

## Phase 2 Migration Plan

Each storefront route migrates by:
1. Creating `src/app/[country]/[lang]/products/page.tsx`
2. Moving logic from `src/app/(storefront)/products/page.tsx`
3. Injecting locale context into queries
4. Using `buildLocaleRoutes()` for internal links
5. Old route redirects to locale-prefixed URL via middleware update

Migration order (by priority):
1. Homepage (done ✅)
2. Product listing + detail
3. Categories
4. Cart + Checkout
5. Orders
6. Profile
7. Auth pages (language toggle only)
