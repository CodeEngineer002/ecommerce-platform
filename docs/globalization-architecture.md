# Globalization Architecture

## Overview

This platform uses a **country-first** globalization architecture. The core principle is that **country defines the business context** (pricing, tax, currency, shipping, payment methods, legal requirements) and **language defines the content presentation** within that country.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                      URL Layer                          │
│         /{country}/{lang}/path                          │
│   /de/de/products  /de/en/products  /in/hi/cart         │
├─────────────────────────────────────────────────────────┤
│                   Routing Layer                         │
│   Next.js App Router  [country]/[lang]/...              │
│   Middleware: locale detection, cookie persistence      │
├─────────────────────────────────────────────────────────┤
│                 Locale Resolution Layer                 │
│   URL params → Cookie → Geo/IP → Accept-Language        │
│   → Country default                                     │
├─────────────────────────────────────────────────────────┤
│               Business Config Layer                     │
│   Currency, Tax Rate, Shipping Thresholds               │
│   Date/Number Formatting  (src/lib/i18n/region-config)  │
├─────────────────────────────────────────────────────────┤
│                  CMS Content Layer                      │
│   localized_cms_pages, localized_homepage_sections      │
│   Per-locale content with fallback chain                │
├─────────────────────────────────────────────────────────┤
│               Translation Layer                         │
│   messages/{lang}.json  — static UI strings             │
│   Lazy-loaded per request                               │
├─────────────────────────────────────────────────────────┤
│                  Database Layer                         │
│   Supabase: countries, languages, locales               │
│   region_configs, localized_* content tables            │
└─────────────────────────────────────────────────────────┘
```

## Supported Countries and Languages

| Country | URL Code | Default Language | Also Supports | Currency |
|---------|----------|-----------------|---------------|----------|
| United States | `us` | English (`en`) | — | USD |
| United Kingdom | `uk` | English (`en`) | — | GBP |
| Germany | `de` | German (`de`) | English (`en`) | EUR |
| France | `fr` | French (`fr`) | English (`en`) | EUR |
| Italy | `it` | Italian (`it`) | English (`en`) | EUR |
| Spain | `es` | Spanish (`es`) | English (`en`) | EUR |
| India | `in` | Hindi (`hi`) | English (`en`) | INR |
| UAE | `ae` | Arabic (`ar`) | English (`en`) | AED |

## Country-First vs Language-First

**Why country-first?**

A product costs ₹1,499 in India and €29.99 in Germany. Tax is included in Germany (MwSt. 19%) but added separately in India (GST 18%). Free shipping triggers at different thresholds. Payment methods differ (UPI in India, SEPA in Germany). These are **country-level decisions**, not language decisions.

Language only affects how content is *presented*, not the business rules underneath.

## Locale ID Format

Locale IDs follow the BCP-47 pattern: `{lang}-{ISO_COUNTRY}`

| URL | Locale ID | Country | Language |
|-----|-----------|---------|----------|
| `/de/de/` | `de-DE` | Germany | German |
| `/de/en/` | `en-DE` | Germany | English |
| `/in/hi/` | `hi-IN` | India | Hindi |
| `/in/en/` | `en-IN` | India | English |
| `/ae/ar/` | `ar-AE` | UAE | Arabic |
| `/ae/en/` | `en-AE` | UAE | English |

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/i18n/config.ts` | Countries, languages, locale config (compile-time) |
| `src/lib/i18n/locale-resolver.ts` | Locale detection from request |
| `src/lib/i18n/region-config.ts` | Business rules per country |
| `src/lib/i18n/routing.ts` | Locale-aware route builders |
| `src/lib/i18n/seo.ts` | hreflang + metadata helpers |
| `src/lib/i18n/direction.ts` | RTL/LTR utilities |
| `src/lib/i18n/translations.ts` | Type-safe translation loader |
| `src/middleware.ts` | Locale detection middleware |
| `supabase/migrations/00007_globalization.sql` | DB schema |

## Future Expansion

Adding a new country requires:
1. Add entry to `COUNTRIES` in `src/lib/i18n/config.ts`
2. Add entries to `supabase/migrations/` (country, locales, region_config seed)
3. Add translation files under `messages/`
4. No code changes needed in routing, middleware, or CMS
