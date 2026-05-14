# CMS Architecture

Enterprise-grade, locale-aware CMS for a global ecommerce platform.

---

## Guiding Principles

1. **Locale-first** — every piece of content is scoped to `(locale_id)`. No global content tables.
2. **Admin ↔ storefront same source** — both read from `localized_cms_pages`, `cms_blocks`, etc.
3. **No legacy tables** — `cms_pages` and `homepage_sections` are not used. Legacy services deleted.
4. **Delivery abstraction** — storefront uses DTOs from `cms-delivery.server.ts`, never raw DB rows.
5. **RBAC enforced** — every write path checks `has_permission()` or `is_admin()` via RLS.

---

## Domain Map

| Domain | Tables | Service file |
|---|---|---|
| Localized pages | `localized_cms_pages` | `cms.localized.ts` |
| Homepage sections | `localized_homepage_sections` | `cms.localized.ts` |
| Reusable blocks | `cms_blocks` | `cms.localized.ts` |
| Page versions | `cms_page_versions` | `cms.versions.ts` |
| Navigation menus | `cms_navigation_menus` + `cms_navigation_items` | `cms.navigation.ts` |
| Banners | `cms_banners` | `cms.banners.ts` |
| Media | `media_assets` + `media_folders` | `cms.media.ts` |

---

## Locale Fallback Chain

```
Request: /de/de/pages/about
  ↓
Look up: localized_cms_pages WHERE slug='about' AND locale_id='de-DE'
  ↓ not found
Look up: locale_id='en-DE'  (country fallback to English)
  ↓ not found
Return: 404
```

Implemented in `cms.localized.server.ts → resolveLocaleIds()`.

---

## Admin → Storefront Data Flow

```
Admin writes:
  Form → upsertLocalizedCmsPage() → localized_cms_pages (via RLS: is_admin())
        → POST /api/cms/revalidate → revalidateTag("cms")

Storefront reads:
  Page component → deliverPage(slug, country, lang)  [cms-delivery.server.ts]
                → getLocalizedCmsPageServer()         [unstable_cache 300s]
                → localized_cms_pages WHERE is_active=true
```

---

## Block Registry

`src/lib/cms/block-registry.ts` defines all block types with:
- Zod validation schema per type
- Display label + description
- Default content shape

Block types: `hero_banner`, `cta_strip`, `category_grid`, `product_carousel`, `rich_text`, `faq`, `newsletter`, `testimonials`, `image_gallery`, `custom_html`.

---

## Publishing Workflow

```
Draft version created:
  createPageVersion({ status: 'draft', ... })

Published:
  publishPageVersion(versionId)
    → UPDATE cms_page_versions SET status='published'
    → UPDATE localized_cms_pages SET title, content, is_active=true
    → revalidateTag("cms")

Archived:
  archivePageVersion(versionId)
    → UPDATE cms_page_versions SET status='archived'
```

---

## Permission Matrix

| Action | Required permission |
|---|---|
| View CMS admin | `cms:read` (or admin) |
| Create/edit pages, blocks, homepage | `cms:edit` |
| Publish a page version | `cms:publish` |
| Preview drafts | `cms:preview` |
| Manage navigation menus | `cms:manage_navigation` |
| Manage banners | `cms:manage_banners` |
| Upload/delete media | `cms:manage_media` |

Admins and super_admins bypass all permission checks.

---

## File Structure

```
src/
├── lib/
│   ├── admin/
│   │   ├── permissions.ts       # Permission code constants
│   │   └── context.tsx          # AdminContext + AdminProvider
│   └── cms/
│       └── block-registry.ts    # Block type definitions + schemas
├── hooks/
│   ├── use-cms-locale.ts        # Country/language selector state
│   └── use-toast.ts
├── components/
│   ├── admin/
│   │   └── permission-gate.tsx  # <PermissionGate permission="cms:edit">
│   └── cms/
│       └── cms-locale-selector.tsx  # Country + language dropdowns
├── features/
│   └── cms/
│       ├── services/
│       │   ├── cms.localized.ts         # Client: pages, sections, blocks CRUD
│       │   ├── cms.localized.server.ts  # Server: cached reads
│       │   ├── cms.versions.ts          # Draft/publish/archive
│       │   ├── cms.navigation.ts        # Menu CRUD
│       │   ├── cms.banners.ts           # Banner CRUD
│       │   └── cms.media.ts             # Media library
│       ├── hooks/
│       │   └── use-localized-cms.ts     # All React Query hooks
│       └── delivery/
│           ├── types.ts                 # Typed DTOs (CmsPageDto, NavMenuDto, etc.)
│           └── cms-delivery.server.ts   # Storefront delivery API
└── app/
    └── admin/
        ├── layout.tsx              # AdminProvider wraps all admin pages
        └── cms/
            ├── layout.tsx          # CMS tab sub-navigation
            ├── page.tsx            # Localized page management
            ├── homepage/page.tsx   # Homepage section management
            ├── blocks/page.tsx     # Reusable blocks
            ├── navigation/page.tsx # Navigation menus
            ├── banners/page.tsx    # Banners
            └── media/page.tsx      # Media library
```
