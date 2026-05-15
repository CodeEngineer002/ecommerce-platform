# CMS Country-Language Navigation Architecture

## Overview

The CMS admin uses a **country-first** navigation hierarchy, similar to enterprise CMS systems like AEM (Adobe Experience Manager). Content is organized by country, then by language, then by module.

## URL Structure

```
/admin/cms                              → redirects to /admin/cms/in/hi/homepage
/admin/cms/[country]                    → redirects to /admin/cms/[country]/[defaultLang]/homepage
/admin/cms/[country]/[lang]             → redirects to /admin/cms/[country]/[lang]/homepage
/admin/cms/[country]/[lang]/homepage    → Homepage sections module
/admin/cms/[country]/[lang]/pages       → CMS pages module
/admin/cms/[country]/[lang]/blocks      → Content blocks module
/admin/cms/[country]/[lang]/navigation  → Navigation menus module
/admin/cms/[country]/[lang]/banners     → Banners module
/admin/cms/[country]/[lang]/media       → Media library (global, not locale-scoped)
```

### Examples

```
/admin/cms/in/hi/homepage    → India / Hindi / Homepage sections
/admin/cms/in/en/homepage    → India / English / Homepage sections
/admin/cms/de/de/pages       → Germany / German / CMS pages
/admin/cms/de/en/pages       → Germany / English / CMS pages
/admin/cms/ae/ar/navigation  → UAE / Arabic / Navigation menus
/admin/cms/ae/en/navigation  → UAE / English / Navigation menus
```

## Navigation Hierarchy

The `CmsCountryNav` component renders a 3-tier navigation bar:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Country: [🇮🇳 India ●] [🇩🇪 Germany] [🇦🇪 UAE] [🇺🇸 US] [🇬🇧 UK] ... │
├─────────────────────────────────────────────────────────────────────┤
│ Language: [हिन्दी HI ●] [English EN]                                │
├─────────────────────────────────────────────────────────────────────┤
│ [Homepage ●] [Pages] [Blocks] [Navigation] [Banners] [Media]        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Module content area                                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Route as Source of Truth

**Before** (broken): Country/language state was stored in React `useState` inside each page component. Switching tabs reset the locale. No permalinks. State duplicated in every module page.

**After** (fixed): Route params are the single source of truth. Module pages use `useParams()` to read `country` and `lang`. The URL is always shareable and bookmarkable.

## Supported Countries & Languages

Defined in `src/lib/i18n/config.ts`:

| Country | Code | Supported Languages |
|---------|------|---------------------|
| India | `in` | Hindi (`hi`), English (`en`) |
| Germany | `de` | German (`de`), English (`en`) |
| UAE | `ae` | Arabic (`ar`), English (`en`) |
| US | `us` | English (`en`) |
| UK | `uk` | English (`en`) |
| France | `fr` | French (`fr`), English (`en`) |
| Italy | `it` | Italian (`it`), English (`en`) |
| Spain | `es` | Spanish (`es`), English (`en`) |

## Route Validation

The `[country]/[lang]/layout.tsx` validates params on every request:
- Invalid country → redirect to `in/hi/homepage`
- Invalid language for country → redirect to `[country]/[defaultLang]/homepage`

## Backward Compatibility

Old flat routes redirect to the new country-first URLs:
- `/admin/cms` → `/admin/cms/in/hi/homepage`
- `/admin/cms/homepage` → `/admin/cms/in/hi/homepage`
- `/admin/cms/pages` → `/admin/cms/in/hi/pages`
- etc.

The admin sidebar now has a single **CMS** entry that links to `/admin/cms`.
