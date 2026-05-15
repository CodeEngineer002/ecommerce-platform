# CMS Inheritance Model

## Overview

The CMS uses an **AEM-like content inheritance model** where country-level content is the source of truth, and language-level content can either inherit from or override country-level content.

## Content Scopes

| Scope | Description | `scope_type` | `locale_id` |
|-------|-------------|--------------|-------------|
| Country | Source content for all languages | `"country"` | `NULL` |
| Locale | Language-specific override | `"locale"` | e.g. `"hi-IN"` |
| Legacy | Pre-inheritance rows | `NULL` | set |

## Inheritance Fields

All CMS content tables (`localized_homepage_sections`, `localized_cms_pages`, `cms_blocks`, `cms_navigation_menus`, `cms_banners`) have these columns added by migration `00015_cms_inheritance.sql`:

```sql
scope_type          TEXT    -- 'country' | 'locale'
inherits_from_id    UUID    -- references the country-level source row
inheritance_enabled BOOLEAN -- true = locale uses country content
override_status     TEXT    -- 'inherited' | 'overridden' | 'detached'
```

## Inheritance States

### `inherited` (default)
- Locale content points to country source via `inherits_from_id`
- `inheritance_enabled = true`, `override_status = 'inherited'`
- Storefront receives country-level content for this locale
- Editing is not possible at locale level

### `overridden`
- Admin broke inheritance; locale has its own copy
- `override_status = 'overridden'`, `inheritance_enabled = false`
- Storefront receives locale-specific content
- Editing is independent of country content

### `detached`
- Admin restored inheritance; locale override is soft-deleted
- `override_status = 'detached'`, `is_active = false`
- Storefront receives country-level content again
- Override is preserved (not deleted) for audit purposes

## Content Resolution Logic

```
resolve(country, lang, module):
  1. Check for active locale override (override_status = 'overridden')
     → If found: return locale override
  2. Check for country-level source content
     → If found: return country content (inherited by locale)
  3. Check legacy locale rows (no scope_type, backward compat)
     → If found: return legacy row
  4. Try fallback language for country
  5. Return empty
```

Implemented in `src/features/cms/services/cms.inheritance.ts` → `resolveEffectiveContent()`.

## Break Inheritance Flow

1. Admin clicks "Break inheritance" on a locale content item
2. Confirmation dialog shown
3. On confirm: `breakInheritance(sourceId, module, country, lang)` called
4. Function creates a locale-level copy of the country source row
5. Copy has `scope_type = 'locale'`, `override_status = 'overridden'`, `inheritance_enabled = false`
6. Admin can now edit locale copy independently
7. Audit log entry created

## Restore Inheritance Flow

1. Admin clicks "Restore inheritance" on an overridden locale item
2. Confirmation dialog shown
3. On confirm: `restoreInheritance(overrideId, module)` called
4. Function marks override as `override_status = 'detached'`, `is_active = false`
5. Locale falls back to country-level content
6. Original override preserved (not deleted)
7. Audit log entry created

## Country-Level Content Management

Country-level content is managed at:
```
/admin/cms/[country]/[lang]/[module]
```

Content with `scope_type = 'country'` serves as the source for all language locales of that country. When admin edits country-level content, the change propagates to all locales with `override_status = 'inherited'`.

## Inheritance Warning

When editing country-level content, admin should be warned:
> "This update will affect all language versions that are inheriting from this country content."

## Audit Log

All inheritance actions are logged in `cms_inheritance_audit`:
- `break_inheritance`
- `restore_inheritance`
- `country_content_published`
- `locale_content_published`
- `country_content_created` / `updated`
- `locale_override_created` / `updated`
