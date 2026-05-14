# Localization Strategy

## Translation Architecture

### Static UI Translations
**Location:** `messages/{lang}.json`  
**Used for:** Nav, buttons, labels, status messages, form fields  
**Loaded via:** `loadMessages(lang)` — lazy, cached per language

```typescript
// Server Component
const messages = await loadMessages('de');
return <button>{messages.cart.checkout}</button>;

// Client Component (pass as prop from Server)
// OR: export from context via LocaleProvider (Phase 7)
```

### CMS-Managed Translations
**Location:** `localized_cms_pages`, `localized_homepage_sections`  
**Used for:** Hero banners, promotional content, static pages, legal pages  
**Managed via:** Admin CMS panel (per locale)

### Dynamic Business Content
**Location:** Product names, descriptions, category names  
**Current approach:** English-only (Phase 2 — add `product_translations` table)  
**Future:** `product_i18n` table: `product_id + locale_id + name + description + slug`

## Translation File Structure

```json
{
  "namespace": {
    "key": "Translated string",
    "keyWithParam": "Hello {name}",
    "pluralKey": "{count} items"
  }
}
```

### Namespaces

| Namespace | Purpose |
|-----------|---------|
| `nav` | Navigation, header, footer |
| `product` | Product detail, listing |
| `cart` | Cart drawer, cart page |
| `checkout` | Checkout flow |
| `order` | Order management, status labels |
| `auth` | Login, register, forgot password |
| `common` | Shared: loading, error, cancel, save |
| `home` | Homepage sections |

## Type Safety

All translation keys are fully typed via the `Messages` interface in `src/lib/i18n/translations.ts`.

```typescript
import { createTranslator, loadMessages, type MessageKey } from "@/lib/i18n/translations";

const messages = await loadMessages('de');
const t = createTranslator(messages);

t('cart.checkout')         // ✅ type-safe
t('cart.nonexistent')      // ❌ TypeScript error
```

## Lazy Loading

Translation bundles are loaded on-demand per language, not bundled with the app:

```typescript
// Only 'de.json' is loaded for German requests — ~5KB per language
const messages = await loadMessages('de');
```

## Upgrade Path to next-intl

The current system is designed to be drop-in replaceable with `next-intl`:

1. `npm install next-intl`
2. Rename `src/lib/i18n/translations.ts` to `src/i18n/request.ts`
3. Configure `createNextIntlPlugin` in `next.config.ts`
4. Replace `loadMessages` calls with `getTranslations`
5. Message files (`messages/*.json`) require **zero changes**

## Missing Translations Fallback

If a key is missing in a non-English language, the system returns the key path itself (not a crash):

```typescript
function getNestedValue(obj, path) {
  return path.split('.').reduce(...) ?? path; // returns 'cart.checkout' if missing
}
```

This ensures the site never shows blank content — developers see the key name and know what to translate.

## Region-Specific Business Strings

Business values (prices, tax labels, shipping thresholds) are NOT stored in translation files. They come from `REGION_CONFIGS` in `src/lib/i18n/region-config.ts` and are formatted at render time:

```typescript
import { formatPrice, getRegionConfig } from "@/lib/i18n/region-config";

// Renders as '₹1,499.00' for India, '€29.99' for Germany
const price = formatPrice(amount, country);

// Tax label: 'GST' for India, 'MwSt.' for Germany
const { taxLabel } = getRegionConfig(country);
```
