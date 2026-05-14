# CMS Localization Model

## Core Principle

Each piece of CMS content is a **locale-specific entity**, not a "translated version" of a global entity. A German homepage section is not a translation of the English one — it can have completely different content, images, CTAs, and messaging.

```
localized_cms_pages:
  slug="about-us" + locale_id="de-DE"  →  German About Us page
  slug="about-us" + locale_id="en-DE"  →  English About Us page (Germany)
  slug="about-us" + locale_id="hi-IN"  →  Hindi About Us page (India)
  slug="about-us" + locale_id="en-IN"  →  English About Us page (India)
```

## Database Tables

### `localized_cms_pages`
```sql
slug         TEXT          -- content identifier (not unique alone)
locale_id    TEXT          -- 'de-DE', 'en-DE', 'hi-IN', 'ar-AE'
country_id   TEXT          -- 'de', 'in', 'ae'
language_id  TEXT          -- 'de', 'hi', 'ar'
title        TEXT          -- localized page title
content      TEXT          -- HTML content (prose-rendered)
seo_title    TEXT
seo_desc     TEXT
is_active    BOOLEAN
UNIQUE(slug, locale_id)
```

### `localized_homepage_sections`
```sql
locale_id    TEXT          -- which locale this section belongs to
country_id   TEXT
language_id  TEXT
type         section_type  -- hero_banner, featured_products, etc.
title        TEXT
subtitle     TEXT
content      JSONB         -- type-specific payload
sort_order   INTEGER
is_active    BOOLEAN
```

### `localized_seo`
```sql
locale_id    TEXT
entity_type  TEXT          -- 'product' | 'category' | 'page' | 'homepage'
entity_id    TEXT          -- UUID or slug
title        TEXT
description  TEXT
og_title     TEXT
og_image_url TEXT
canonical_path TEXT
UNIQUE(locale_id, entity_type, entity_id)
```

## Fallback Chain

When content is requested for `de/en` (Germany, English):
1. Look for `locale_id = 'en-DE'`
2. If not found, fall back to `locale_id = 'de-DE'` (country default)
3. If not found, return null / empty

This is implemented in `cms.localized.server.ts:resolveLocaleId()`.

## Admin CMS Workflow

The admin CMS UI (Phase 10 — to be built) will work as follows:

1. Admin selects **Country** (e.g. Germany)
2. Admin selects **Language** (e.g. German or English)
3. CMS shows content for that exact locale
4. Creating/editing a page creates a `localized_cms_pages` row for that locale
5. Each locale version is independent — editing German doesn't touch English

## Existing Global CMS

The existing `cms_pages` and `homepage_sections` tables remain for the default/global storefront. The localized system is additive — existing content at `/(storefront)/*` continues to work unchanged.

## Service Architecture

```
Server Components (RSC)      →  cms.localized.server.ts (createServiceClient + unstable_cache)
React Query hooks (client)   →  cms.localized.ts        (createClient)
Admin mutations              →  cms.localized.ts        (POST to /api/cms/revalidate)
```

Cache tag: `localized-cms` (invalidated on admin save)

## Content Types

Each `type` in `localized_homepage_sections` has a typed `content` JSONB:

```typescript
// hero_banner
{ badge?: string, cta_text: string, cta_link: string, image_url?: string }

// featured_products
{ limit: number, product_ids?: string[] }

// promotional_banner
{ bg_color?: string, cta_text: string, cta_link: string }

// category_grid
{ category_ids: string[], columns: number }
```
