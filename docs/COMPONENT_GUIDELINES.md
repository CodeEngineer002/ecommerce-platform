# Component Guidelines

Internal design system built on top of shadcn/ui + Radix UI.

---

## Layer Architecture

```
src/components/
├── ui/          Headless primitives (Radix-based, shadcn-managed)
├── common/      Business-agnostic utilities (forms, tables, dialogs)
├── ecommerce/   Feature-specific (cart, products, filters)
├── feedback/    State displays (empty, loading, error)
└── layout/      Page structure (navbar, footer, admin sidebar)
```

**Rule:** only import *up* the stack. `ui/` knows nothing about `common/`, `ecommerce/` etc. `common/` can import from `ui/`. `ecommerce/` can import from `ui/` and `common/`.

---

## Naming Conventions

| Pattern | Example |
|---|---|
| PascalCase function names | `ProductCard`, `DashboardCard` |
| Prop interfaces named `{Component}Props` | `DashboardCardProps` |
| CVA variable named `{component}Variants` | `buttonVariants`, `inputVariants` |
| Exported type for variants | `VariantProps<typeof buttonVariants>` |
| Files lowercase-kebab | `product-card.tsx`, `dashboard-card.tsx` |

---

## Component API Conventions

Every component must:

1. **Accept `className`** — always pass it to the outermost element via `cn()`.
2. **Use `cn()` for all class merging** — never concatenate strings directly.
3. **Forward refs** where the element is an interactive native element (`input`, `button`, `textarea`).
4. **Use CVA for variants** — whenever a component has more than one visual state or size.

```tsx
// Correct pattern
const inputVariants = cva("base-classes", {
  variants: { size: { sm: "…", md: "…" }, state: { default: "…", error: "…" } },
  defaultVariants: { size: "md", state: "default" },
});

interface MyComponentProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof inputVariants> {
  className?: string;
}
```

5. **Never hardcode colors** outside of `ui/` — use semantic Tailwind tokens (`text-destructive`, `bg-success/15`, etc.).
6. **Prop naming** — use `as` for polymorphic tag override; `inputSize` instead of `size` when the native `size` attr conflicts.

---

## Design Tokens

**Source of truth:** `src/styles/globals.css` (CSS variables) + `tailwind.config.ts` (Tailwind tokens).  
**JS constants:** `src/lib/design-tokens.ts` for use in animations and non-CSS contexts.

### Color System

| Token | Usage |
|---|---|
| `primary` | Brand actions, focus rings |
| `secondary` | Secondary actions |
| `muted` / `muted-foreground` | Placeholders, helper text, disabled |
| `destructive` | Errors, delete actions |
| `success` | Confirmations, positive feedback |
| `warning` | Caution states |
| `info` | Neutral informational |
| `brand-{50-950}` | Marketing surfaces, gradient backgrounds |

All color tokens exist as CSS variables and automatically adapt to dark mode. **Never use raw Tailwind palette colors** (e.g., `text-green-600`) in new components — use `text-success` instead so dark mode works correctly.

> **Exception:** `badge.tsx` and similar shadcn-managed files in `ui/` may use palette colors. Do not modify those.

### Z-index Scale

| Name | Value | Usage |
|---|---|---|
| `z-dropdown` | 1000 | Dropdowns, select menus |
| `z-sticky` | 1020 | Sticky headers |
| `z-fixed` | 1030 | Fixed position bars |
| `z-modal-backdrop` | 1040 | Dialog overlays |
| `z-modal` | 1050 | Dialog content |
| `z-popover` | 1060 | Tooltips, popovers |
| `z-toast` | 1080 | Toast notifications |

Always use these named values. Never write raw `z-[1234]` values.

---

## Typography

Use the `Heading` and `Text` components from `@/components/ui/typography` instead of raw `<h1>`, `<p>` with inline Tailwind for new UI text.

```tsx
import { Heading, Text } from "@/components/ui/typography";

// Semantic element with responsive scale
<Heading as="h1" size="h1">Page Title</Heading>
<Heading as="h3" size="h4">Card Title</Heading>  // visual override

// Text variants
<Text variant="muted" size="sm">Helper text</Text>
<Text as="span" weight="semibold">Label</Text>
<Text variant="destructive" size="xs">Error</Text>
```

---

## Form System

Use `FormField` from `@/components/common/form-field` — never raw `<input>` in forms.

```tsx
<FormField
  label="Email"
  type="email"
  required
  error={errors.email}        // FieldError | string
  description="We'll never share your email"
  {...register("email")}
/>
```

`FormField` automatically:
- links `<label>` to input via `htmlFor`/`id`
- links description + error to input via `aria-describedby`
- sets `aria-invalid` when error is present
- announces error with `role="alert"`

**Input sizes:** pass `inputSize="sm" | "md" | "lg"` for different field heights.  
**Input states:** `state="default" | "error" | "success"` — or the shorthand `error={true}`.

---

## Skeleton System

Use composites from `@/components/ui/skeleton` for loading states:

```tsx
import {
  Skeleton, SkeletonText, SkeletonCard,
  SkeletonAvatar, SkeletonTable, SkeletonListItem, SkeletonFormField,
} from "@/components/ui/skeleton";

<SkeletonCard />                     // product card shape
<SkeletonText lines={3} />           // paragraph placeholder
<SkeletonAvatar size="lg" />         // circular avatar
<SkeletonTable rows={5} cols={4} />  // data table
<SkeletonFormField />                // label + input row
```

All skeletons have `aria-hidden="true"` — they are purely decorative loading indicators.

---

## Toast System

Use `useToast` from `@/hooks/use-toast` — never import `react-hot-toast` directly.

```tsx
const { success, error, warning, info, promise } = useToast();

success("Order placed!");
error("Payment failed", { duration: 7000 });
await promise(saveOrder(), {
  loading: "Saving…",
  success: "Saved!",
  error: "Failed to save",
});
```

For non-component contexts (API handlers, utils): use `toastNotify` from the same file.

---

## Accessibility Conventions

### Required on all components

- **`className` passthrough** to outermost element
- **`cn()` for all class merging** — ensures consumer overrides work
- Decorative icons: `aria-hidden="true"`
- Meaningful icons (standalone buttons): `aria-label` on the button

### Interactive components

- Focus ring: use `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- Never suppress focus outlines without providing a replacement
- Keyboard-operable: every action achievable by mouse must be reachable by keyboard

### Dynamic content

| Pattern | Usage |
|---|---|
| `role="status"` | Non-urgent state updates (empty states, loading) |
| `role="alert"` + `aria-live="assertive"` | Urgent errors, validation failures |
| `aria-current="page"` | Active nav links |
| `aria-invalid` | Form inputs in error state |
| `aria-describedby` | Linking description/error text to inputs |
| `aria-required` | Required form fields |

### Color

Never convey meaning through color alone. Pair color with text or icons:

```tsx
// Wrong — color only
<span className="text-red-500">{message}</span>

// Correct — color + icon
<span className="flex gap-1 text-destructive">
  <AlertCircle className="h-4 w-4" aria-hidden="true" />
  {message}
</span>
```

---

## Dark Mode

Dark mode is class-based (`.dark` on `<html>`). All semantic tokens automatically invert via CSS variables.

- **Use semantic tokens** — `bg-background`, `text-foreground`, `border-border`, etc.
- **Never hardcode light/dark colors** in components.
- When you need a conditional dark class, use Tailwind's `dark:` prefix.

```tsx
// Good — token-based, works in both modes
<div className="bg-card text-card-foreground border">…</div>

// Bad — hardcodes light appearance
<div className="bg-white text-gray-900 border-gray-200">…</div>
```

---

## White-labeling / Theme Customization

To reskin the entire app, override the CSS variables in `:root`:

```css
:root {
  --primary: 210 100% 50%;      /* New brand color */
  --primary-foreground: 0 0% 100%;
  --radius: 0.25rem;            /* Squarer corners */
}
```

No component code needs to change. This is why all components use semantic tokens.

---

## What NOT to do

- Do not `import toast from "react-hot-toast"` — use `useToast` hook
- Do not write raw `<h1 className="text-2xl font-bold">` in new pages — use `<Heading>`
- Do not create one-off skeleton divs in loading.tsx — use `SkeletonCard` / `SkeletonTable`
- Do not add `z-[1234]` — use the named `z-modal`, `z-dropdown` etc.
- Do not import from `@/components/ecommerce/*` inside `@/components/ui/*`
- Do not add comments explaining what code does — only comment *why* (non-obvious constraints)
