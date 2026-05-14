// ── CMS Delivery DTOs ─────────────────────────────────────────────────────────
// These are the typed contracts between the CMS delivery layer and the
// storefront rendering layer. The storefront NEVER uses raw DB row types.

import type { BlockType } from "@/lib/cms/block-registry";

// ── Page ──────────────────────────────────────────────────────────────────────

export interface CmsPageDto {
  id: string;
  slug: string;
  title: string;
  content: string | null;
  seo: CmsSeoDto;
  isActive: boolean;
  localeId: string;
  countryId: string;
  languageId: string;
  updatedAt: string;
}

export interface CmsSeoDto {
  title: string | null;
  description: string | null;
}

// ── Homepage sections ─────────────────────────────────────────────────────────

export interface HomepageSectionDto {
  id: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  content: Record<string, unknown> | null;
  sortOrder: number;
  isActive: boolean;
  localeId: string;
}

// ── Blocks ────────────────────────────────────────────────────────────────────

export interface CmsBlockDto {
  id: string;
  handle: string;
  type: BlockType;
  title: string | null;
  content: string | null;
  contentJson: Record<string, unknown> | null;
  isActive: boolean;
  localeId: string;
}

// ── Navigation ────────────────────────────────────────────────────────────────

export interface NavItemDto {
  id: string;
  label: string;
  url: string | null;
  pageId: string | null;
  target: "_self" | "_blank";
  icon: string | null;
  sortOrder: number;
  children: NavItemDto[];
}

export interface NavMenuDto {
  id: string;
  handle: string;
  name: string;
  localeId: string;
  items: NavItemDto[];
}

// ── Banners ───────────────────────────────────────────────────────────────────

export interface CmsBannerDto {
  id: string;
  handle: string;
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  ctaOpenNewTab: boolean;
  backgroundColor: string | null;
  textColor: string | null;
  sortOrder: number;
  validFrom: string | null;
  validUntil: string | null;
  localeId: string;
}

// ── Media ─────────────────────────────────────────────────────────────────────

export interface MediaAssetDto {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  tags: string[];
}
