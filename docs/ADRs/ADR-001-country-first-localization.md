# ADR-001: Country-First Localization

**Status:** Accepted  
**Date:** 2026-05-16  
**Deciders:** Architecture team  
**Supersedes:** —  
**Superseded by:** —

---

## Context

This platform serves customers in 8 countries across 7 languages. Two fundamental design questions arise:

1. Should the URL be language-first (`/en/in/products`) or country-first (`/in/en/products`)?
2. Should business configuration (tax rates, currencies, shipping) be derived from language or from country?

Many global commerce platforms structure routing around language, with country as a secondary parameter. However, this creates mismatches: the same language can be spoken in multiple countries with radically different tax laws, currencies, and shipping rules.

---

## Decision

**Country is the primary context. Language is a presentation layer.**

- URL structure: `/{country}/{lang}/{path}` (e.g., `/in/hi/products`)
- Business config (tax, currency, shipping, address rules) is keyed by `country_id`
- Content (translations, CMS pages) is keyed by `(country_id, language_code)`
- A customer in Germany must see EUR pricing regardless of their language preference

---

## Problem Being Solved

**Example 1:** A German-speaking customer in Switzerland (`/ch/de/`) must see CHF prices and Swiss tax rates — not German EUR prices. Country determines the commercial experience.

**Example 2:** India supports both Hindi and English, but both speakers face the same ₹999 free shipping threshold and 18% GST.

**Example 3:** Arabic is spoken in both UAE (`/ae/ar/`) and Saudi Arabia (not yet supported). Each country would have different VAT rates (5% UAE vs 15% SA).

---

## Alternatives Considered

| Alternative | Why Rejected |
|------------|-------------|
| Language-first routing (`/en/in/`) | Language is presentation; country drives business rules. Reversed priority creates schema confusion |
| Single global locale (`/in-hi/`) | BCP-47 tags don't cleanly separate business (country) from presentation (language) |
| Country-only routing (no lang in URL) | Harms SEO (duplicate content across languages); requires cookie-only language selection |
| Server-only locale detection (no URL) | Harms SEO; cannot be cached at CDN level; breaks shareable links |

---

## Tradeoffs

**Benefits:**
- Business config (pricing, tax, shipping) cleanly isolated per country
- URL is unambiguous and cacheable at CDN level
- SEO: distinct URL per locale, proper hreflang support
- CMS content: keyed by `(country, language)` — clean separation
- Address validation rules, payment methods, and shipping carriers can vary per country

**Costs:**
- Slightly longer URLs (two path segments vs one)
- Middleware must validate both country and language segments
- Admin CMS navigation also must be country-first (matches storefront model)
- URL migration required when adding new country/language combinations

---

## Implementation

```
src/lib/i18n/config.ts         — Compile-time country/language config
src/lib/i18n/locale-resolver.ts — Locale detection (URL → cookie → geo → default)
src/middleware.ts               — Enforces /{country}/{lang}/ prefix
src/lib/config/region-config.ts — Country-keyed business config (tax, currency, shipping)
```

DB: `country_id` column present in `carts`, `customer_addresses`, `localized_cms_pages`, etc.

---

## Future Implications

- Adding a new country requires: entry in `region-config.ts`, locale config update, CMS content for that country
- Language expansion within a country is independent of pricing (add language to `supportedLangs`, create translations)
- Multi-currency carts (customer in one country buying cross-border) would require revisiting this model — currently out of scope

---

## Related

- `docs/globalization-architecture.md` — Full globalization architecture
- `docs/locale-routing.md` — URL routing implementation
- ADR-003: CMS Inheritance Model (relies on country-first)
