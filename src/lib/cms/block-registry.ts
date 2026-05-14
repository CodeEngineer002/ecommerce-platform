import { z } from "zod";

// ── Block type definitions ────────────────────────────────────────────────────
// Each block type has: id, label, schema (for validation), defaultContent

export const BLOCK_TYPES = [
  "hero_banner",
  "cta_strip",
  "category_grid",
  "product_carousel",
  "rich_text",
  "faq",
  "newsletter",
  "testimonials",
  "image_gallery",
  "custom_html",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

// ── Per-type content schemas ──────────────────────────────────────────────────

export const blockSchemas: Record<BlockType, z.ZodTypeAny> = {
  hero_banner: z.object({
    heading:     z.string(),
    subheading:  z.string().optional(),
    image_url:   z.string().url().optional(),
    cta_text:    z.string().optional(),
    cta_url:     z.string().optional(),
    badge:       z.string().optional(),
    align:       z.enum(["left", "center", "right"]).default("center"),
  }),

  cta_strip: z.object({
    text:      z.string(),
    cta_text:  z.string(),
    cta_url:   z.string(),
    bg_color:  z.string().optional(),
  }),

  category_grid: z.object({
    heading:     z.string().optional(),
    category_ids: z.array(z.string()).default([]),
    columns:     z.number().min(2).max(6).default(3),
  }),

  product_carousel: z.object({
    heading:     z.string().optional(),
    product_ids: z.array(z.string()).default([]),
    limit:       z.number().min(1).max(20).default(8),
  }),

  rich_text: z.object({
    content: z.string(),
  }),

  faq: z.object({
    heading: z.string().optional(),
    items: z.array(z.object({
      question: z.string(),
      answer:   z.string(),
    })).default([]),
  }),

  newsletter: z.object({
    heading:     z.string().optional(),
    subheading:  z.string().optional(),
    cta_text:    z.string().default("Subscribe"),
    placeholder: z.string().default("Your email address"),
  }),

  testimonials: z.object({
    heading: z.string().optional(),
    items: z.array(z.object({
      author:  z.string(),
      role:    z.string().optional(),
      text:    z.string(),
      rating:  z.number().min(1).max(5).optional(),
      avatar:  z.string().optional(),
    })).default([]),
  }),

  image_gallery: z.object({
    images: z.array(z.object({
      url:     z.string().url(),
      alt:     z.string().optional(),
      caption: z.string().optional(),
    })).default([]),
    columns: z.number().min(1).max(6).default(3),
  }),

  custom_html: z.object({
    html: z.string(),
  }),
};

// ── Block registry entry ──────────────────────────────────────────────────────

export interface BlockRegistryEntry {
  type: BlockType;
  label: string;
  description: string;
  icon: string;
  schema: z.ZodTypeAny;
  defaultContent: Record<string, unknown>;
}

export const BLOCK_REGISTRY: Record<BlockType, BlockRegistryEntry> = {
  hero_banner: {
    type: "hero_banner",
    label: "Hero Banner",
    description: "Full-width banner with heading, image, and CTA",
    icon: "layout-panel-top",
    schema: blockSchemas.hero_banner,
    defaultContent: { heading: "Welcome", align: "center" },
  },
  cta_strip: {
    type: "cta_strip",
    label: "CTA Strip",
    description: "Promotional strip with call-to-action button",
    icon: "megaphone",
    schema: blockSchemas.cta_strip,
    defaultContent: { text: "Special offer", cta_text: "Shop Now", cta_url: "/products" },
  },
  category_grid: {
    type: "category_grid",
    label: "Category Grid",
    description: "Grid of category cards linking to category pages",
    icon: "grid-2x2",
    schema: blockSchemas.category_grid,
    defaultContent: { category_ids: [], columns: 3 },
  },
  product_carousel: {
    type: "product_carousel",
    label: "Product Carousel",
    description: "Horizontal scrolling product showcase",
    icon: "gallery-horizontal-end",
    schema: blockSchemas.product_carousel,
    defaultContent: { product_ids: [], limit: 8 },
  },
  rich_text: {
    type: "rich_text",
    label: "Rich Text",
    description: "Formatted text content (HTML/Markdown)",
    icon: "type",
    schema: blockSchemas.rich_text,
    defaultContent: { content: "" },
  },
  faq: {
    type: "faq",
    label: "FAQ Section",
    description: "Accordion-style FAQ list",
    icon: "circle-help",
    schema: blockSchemas.faq,
    defaultContent: { items: [] },
  },
  newsletter: {
    type: "newsletter",
    label: "Newsletter Signup",
    description: "Email subscription form",
    icon: "mail",
    schema: blockSchemas.newsletter,
    defaultContent: { cta_text: "Subscribe", placeholder: "Your email address" },
  },
  testimonials: {
    type: "testimonials",
    label: "Testimonials",
    description: "Customer review or quote cards",
    icon: "quote",
    schema: blockSchemas.testimonials,
    defaultContent: { items: [] },
  },
  image_gallery: {
    type: "image_gallery",
    label: "Image Gallery",
    description: "Responsive image grid or masonry layout",
    icon: "images",
    schema: blockSchemas.image_gallery,
    defaultContent: { images: [], columns: 3 },
  },
  custom_html: {
    type: "custom_html",
    label: "Custom HTML",
    description: "Raw HTML / embed code",
    icon: "code",
    schema: blockSchemas.custom_html,
    defaultContent: { html: "" },
  },
};

export function validateBlockContent(type: BlockType, content: unknown): boolean {
  const schema = blockSchemas[type];
  return schema.safeParse(content).success;
}

export function getBlockEntry(type: BlockType): BlockRegistryEntry {
  return BLOCK_REGISTRY[type];
}
