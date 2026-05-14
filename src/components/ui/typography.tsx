import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

// ── Heading ───────────────────────────────────────────────────────────────

const headingVariants = cva("font-bold tracking-tight text-foreground", {
  variants: {
    size: {
      h1: "text-4xl sm:text-5xl lg:text-6xl",
      h2: "text-3xl sm:text-4xl",
      h3: "text-2xl sm:text-3xl",
      h4: "text-xl sm:text-2xl",
      h5: "text-lg font-semibold",
      h6: "text-base font-semibold",
    },
    align: {
      left: "text-left",
      center: "text-center",
      right: "text-right",
    },
  },
  defaultVariants: {
    size: "h2",
    align: "left",
  },
});

type HeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants> {
  /** Rendered HTML element. Defaults to h2. */
  as?: HeadingLevel;
}

/**
 * Heading — semantic heading with responsive type scale.
 *
 * Usage:
 *   <Heading as="h1" size="h1">Page title</Heading>
 *   <Heading as="h3" size="h4" className="mb-2">Card title</Heading>
 *
 * When `size` is omitted it defaults to match `as`, so
 *   <Heading as="h1"> automatically gets h1 styling.
 */
function Heading({ as: Tag = "h2", size, align, className, ...props }: HeadingProps) {
  const resolvedSize = (size ?? Tag) as VariantProps<typeof headingVariants>["size"];
  return (
    <Tag
      className={cn(headingVariants({ size: resolvedSize, align }), className)}
      {...props}
    />
  );
}

// ── Text ──────────────────────────────────────────────────────────────────

const textVariants = cva("", {
  variants: {
    variant: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      destructive: "text-destructive",
      success: "text-success",
      warning: "text-warning",
      info: "text-info",
    },
    size: {
      xs: "text-xs",
      sm: "text-sm",
      md: "text-base",
      lg: "text-lg",
      xl: "text-xl",
    },
    weight: {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
    align: {
      left: "text-left",
      center: "text-center",
      right: "text-right",
    },
    truncate: {
      true: "truncate",
    },
    balance: {
      true: "text-balance",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "md",
    weight: "normal",
  },
});

type TextTag = "p" | "span" | "div" | "small" | "strong" | "em" | "li" | "label";

interface TextProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof textVariants> {
  /** Rendered HTML element. Defaults to p. */
  as?: TextTag;
}

/**
 * Text — flexible inline/block text with semantic color + size variants.
 *
 * Usage:
 *   <Text variant="muted" size="sm">Helper text</Text>
 *   <Text as="span" weight="semibold">Emphasized</Text>
 *   <Text variant="destructive" size="xs">Error message</Text>
 */
function Text({ as: Tag = "p", variant, size, weight, align, truncate, balance, className, ...props }: TextProps) {
  return (
    <Tag
      className={cn(textVariants({ variant, size, weight, align, truncate, balance }), className)}
      {...props}
    />
  );
}

// ── Code ──────────────────────────────────────────────────────────────────

interface CodeProps extends React.HTMLAttributes<HTMLElement> {
  block?: boolean;
}

/**
 * Code — inline `<code>` or block `<pre><code>` for technical content.
 */
function Code({ block = false, className, children, ...props }: CodeProps) {
  if (block) {
    return (
      <pre className={cn("overflow-x-auto rounded-md bg-muted p-4 text-sm font-mono", className)} {...props}>
        <code>{children}</code>
      </pre>
    );
  }
  return (
    <code
      className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-sm", className)}
      {...props}
    >
      {children}
    </code>
  );
}

export { Code, Heading, headingVariants, Text, textVariants };
