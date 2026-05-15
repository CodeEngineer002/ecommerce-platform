# ADR-003: CMS Inheritance Model (Country → Locale)

**Status:** Accepted  
**Date:** 2026-05-16  
**Deciders:** Architecture team  
**Supersedes:** —  
**Superseded by:** —

---

## Context

Content management for a multi-country, multi-language platform presents a scaling challenge: 8 countries × 7 languages = up to 56 locale-variants of every CMS page. Creating fully independent content for each locale is impractical and leads to duplication. However, some content must be country-specific (prices, local regulations, promotions) while other content can be shared.

The platform needed a content inheritance model that:
- Reduces content authoring burden
- Supports country-specific overrides
- Supports locale-level overrides when needed
- Allows content teams to "break" inheritance for exceptions
- Is auditable and reversible

---

## Decision

**Content inherits from country-level to locale-level. Inheritance can be overridden per locale, and restored.**

**Three content states for any locale-level page:**

| State | DB Value | Meaning |
|-------|---------|---------|
| `inherited` | `content = NULL` | Uses country-level content verbatim |
| `overridden` | `content = {...}` | Has locale-specific content (different from country) |
| `detached` | `content = {}` | Explicitly empty — no content for this locale |

**Inheritance resolution algorithm:**
```
1. Look up localized_cms_pages WHERE page_id = ? AND country_id = ? AND language_code = ?
2. If row exists and content IS NOT NULL → return locale content
3. If row exists and content IS NULL → look up country default language content
4. If country default content found → return it
5. Otherwise → 404
```

**Key design:** The system is "country-first, locale-inherits" — not "global with country overrides". There is no global/master content. Country is the base.

---

## Problem Being Solved

**Example 1:** Germany has 3 languages (de, en, fr for expats). The German homepage (de-DE) is the authoritative source. The en-DE and fr-DE variants inherit from de-DE by default. Only if content needs language-specific adjustments is an override created.

**Example 2:** India runs a Diwali promotion. The in-hi page gets updated. The in-en variant inherits the promotion automatically — no duplicate effort required.

**Example 3:** UAE has Arabic as primary and English as secondary. The ae-ar content is authoritative. ae-en inherits. When English speakers need a different CTA, inheritance is "broken" for ae-en only.

---

## Alternatives Considered

| Alternative | Why Rejected |
|------------|-------------|
| Fully independent content per locale (no inheritance) | 56 pages × N content blocks = unmanageable duplication |
| Global master with country overrides | No single "global" content makes sense when tax/regulatory content is country-specific |
| Translation-based system | CMS content is not translated — it's locale-specific (different promotions, different layouts) |
| Flat key-value translations | Doesn't support rich block-based layouts per locale |

---

## Tradeoffs

**Benefits:**
- Content authors manage one country-level page; locale variants inherit automatically
- Override only when genuinely different content is needed
- Inheritance is reversible (`restore_inheritance`)
- Audit trail (`cms_inheritance_audit` table) for compliance and debugging
- Reduced DB storage (NULL = inherit, no data duplication)

**Costs:**
- Two-step DB lookup required for every CMS page delivery (locale → country fallback)
- Content editors must understand inheritance semantics
- Detached locales can create content gaps (user sees nothing) — requires training
- `break_inheritance` requires explicit permission (`cms:break_inheritance`)

---

## Implementation

```sql
-- localized_cms_pages table
page_id         UUID FK → cms_pages
country_id      VARCHAR FK → countries  
language_code   VARCHAR
content         JSONB NULL  -- NULL = inherited, {} = detached, {...} = overridden
published_version INTEGER
```

```typescript
// src/lib/cms/cms-delivery.ts (simplified)
async function resolveCMSContent(pageId, countryId, langCode) {
  // 1. Try exact locale
  const locale = await db.localized_cms_pages
    .findOne({ page_id: pageId, country_id: countryId, language_code: langCode });
  if (locale?.content !== null) return locale.content;

  // 2. Fallback to country default language
  const country = await db.countries.findOne({ id: countryId });
  const fallback = await db.localized_cms_pages
    .findOne({ page_id: pageId, country_id: countryId, language_code: country.defaultLang });
  return fallback?.content ?? null; // null = 404
}
```

**Permission model:**
- `cms:edit` — Can edit content in any locale
- `cms:break_inheritance` — Can detach locale from country inheritance
- `cms:restore_inheritance` — Can re-link locale to country inheritance
- `cms:publish_country` — Can publish country-level content
- `cms:publish_locale` — Can publish locale-level overrides

---

## Future Implications

- A "global content" layer (above country) could be added as a third tier without breaking the model
- Content versioning per locale is possible (each `localized_cms_pages` row has a version reference)
- Content scheduling (publish at specific time) should respect inheritance — needs careful implementation
- A/B testing content variants would need to sit above the inheritance layer

---

## Related

- `docs/cms-inheritance-model.md` — Detailed implementation guide
- `docs/cms-localization-model.md` — CMS data model
- `docs/cms-architecture.md` — CMS system overview
- ADR-001: Country-First Localization (conceptual foundation)
