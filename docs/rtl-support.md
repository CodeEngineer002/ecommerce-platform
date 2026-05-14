# RTL Support

## Overview

Arabic (`ar`) is the only RTL language in the current supported set. The layout must mirror horizontally: text aligns right, icons are on the opposite side, flex rows reverse direction, and spacing uses logical properties.

## How It Works

### 1. HTML `dir` Attribute

The `[country]/[lang]/layout.tsx` sets `dir` on the `<html>` tag:

```tsx
const { dir } = getHtmlAttributes(lang); // 'rtl' for Arabic
return <html lang="ar" dir="rtl" ...>
```

This single attribute enables browser-native RTL behaviour and activates Tailwind's `rtl:` variant.

### 2. Tailwind RTL Variants

Tailwind CSS includes `rtl:` and `ltr:` variants automatically. Use them for any direction-dependent styles:

```tsx
// Correct: directional margin
<div className="ms-4 rtl:me-4">

// Correct: icon placement
<Icon className="me-2" />  // me = margin-end (right in LTR, left in RTL)

// Avoid: hardcoded direction
<div className="ml-4">   // ❌ breaks in RTL
<div className="ms-4">   // ✅ logical property
```

### 3. Logical Properties (Preferred)

Always prefer CSS logical properties over physical directional properties:

| Physical (avoid) | Logical (use) | Tailwind Class |
|-----------------|---------------|----------------|
| `margin-left` | `margin-inline-start` | `ms-*` |
| `margin-right` | `margin-inline-end` | `me-*` |
| `padding-left` | `padding-inline-start` | `ps-*` |
| `padding-right` | `padding-inline-end` | `pe-*` |
| `text-left` | `text-start` | `text-start` |
| `text-right` | `text-end` | `text-end` |
| `left: 0` | `inset-inline-start: 0` | `start-0` |
| `right: 0` | `inset-inline-end: 0` | `end-0` |

### 4. Direction Utilities (`src/lib/i18n/direction.ts`)

```typescript
import { getDirection, isRtl, logical, getFontClass } from "@/lib/i18n/direction";

// Check direction
const isArabic = isRtl('ar'); // true

// Conditional class
const alignClass = dir('text-start', 'text-end', isArabic);

// Logical properties
<div className={logical.ms('4')}>  // ms-4
```

### 5. Arabic Font

Arabic text requires `Noto Sans Arabic`. The locale layout loads it:

```tsx
const notoArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-arabic"
});
```

Apply it in Arabic context:

```tsx
<body className={cn(inter.variable, notoArabic.variable, "font-sans")}>
  {/* Arabic sections: add font-arabic class */}
  <p className="ar:font-arabic">مرحباً</p>
```

Or use the helper: `getFontClass('ar')` → `'font-arabic'`

## Component Guidelines

### Flex layouts
```tsx
// Use flex-row — RTL direction handles reversal via dir="rtl"
<div className="flex items-center gap-3">
  <Icon />
  <span>Label</span>
</div>
// RTL: browser automatically reverses to: Label | Icon
```

### Absolute positioning
```tsx
// ❌ Hardcoded
<div className="absolute right-4 top-4">

// ✅ Logical
<div className="absolute end-4 top-4">
```

### Icons with text
```tsx
// ❌
<ChevronRight className="ml-2" />

// ✅
<ChevronRight className="ms-2 rtl:rotate-180" />
```

## Testing RTL

To test the Arabic locale:
1. Navigate to `/ae/ar/`
2. Open DevTools → Elements
3. Confirm `<html dir="rtl" lang="ar">`
4. Verify the layout mirrors horizontally
