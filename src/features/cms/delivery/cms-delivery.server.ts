import "server-only";

import {
  getActiveBannersServer,
  getCmsBlockServer,
  getCmsBlocksServer,
  getLocalizedCmsPageServer,
  getLocalizedCmsPagesServer,
  getLocalizedHomepageSectionsServer,
  getNavigationMenuServer,
} from "@/features/cms/services/cms.localized.server";
import type { NavMenuWithItems } from "@/features/cms/services/cms.localized.server";
import type { BlockType } from "@/lib/cms/block-registry";
import { sanitizeCmsHtml } from "@/lib/cms/sanitize";
import { toLocaleId, type CountryCode, type LanguageCode } from "@/lib/i18n/config";
import type {
  CmsBanner,
  CmsBlock,
  CmsNavigationItem,
  LocalizedCmsPage,
  LocalizedHomepageSection,
} from "@/types";

import type {
  CmsBannerDto,
  CmsBlockDto,
  CmsPageDto,
  HomepageSectionDto,
  NavItemDto,
  NavMenuDto,
} from "./types";

// ── Mappers: DB row → DTO ─────────────────────────────────────────────────────

function mapPage(row: LocalizedCmsPage): CmsPageDto {
  return {
    id:         row.id,
    slug:       row.slug,
    title:      row.title,
    content:    sanitizeCmsHtml(row.content),
    seo:        { title: row.seo_title, description: row.seo_desc },
    isActive:   row.is_active,
    localeId:   row.locale_id,
    countryId:  row.country_id,
    languageId: row.language_id,
    updatedAt:  row.updated_at,
  };
}

function mapSection(row: LocalizedHomepageSection): HomepageSectionDto {
  return {
    id:        row.id,
    type:      row.type,
    title:     row.title,
    subtitle:  row.subtitle,
    content:   row.content as Record<string, unknown> | null,
    sortOrder: row.sort_order,
    isActive:  row.is_active,
    localeId:  row.locale_id,
  };
}

function mapBlock(row: CmsBlock): CmsBlockDto {
  return {
    id:          row.id,
    handle:      row.handle,
    type:        row.type as BlockType,
    title:       row.title,
    content:     row.content,
    contentJson: row.content_json as Record<string, unknown> | null,
    isActive:    row.is_active,
    localeId:    row.locale_id,
  };
}

function mapNavItem(row: CmsNavigationItem & { children?: CmsNavigationItem[] }): NavItemDto {
  return {
    id:        row.id,
    label:     row.label,
    url:       row.url,
    pageId:    row.page_id,
    target:    (row.target as "_self" | "_blank") ?? "_self",
    icon:      row.icon,
    sortOrder: row.sort_order,
    children:  (row.children ?? []).map(mapNavItem),
  };
}

function mapBanner(row: CmsBanner): CmsBannerDto {
  return {
    id:              row.id,
    handle:          row.handle,
    title:           row.title,
    subtitle:        row.subtitle,
    imageUrl:        row.image_url,
    ctaText:         row.cta_text,
    ctaUrl:          row.cta_url,
    ctaOpenNewTab:   row.cta_open_new_tab,
    backgroundColor: row.background_color,
    textColor:       row.text_color,
    sortOrder:       row.sort_order,
    validFrom:       row.valid_from,
    validUntil:      row.valid_until,
    localeId:        row.locale_id,
  };
}

// ── Public delivery API ───────────────────────────────────────────────────────
// The storefront calls ONLY these functions — never raw table queries.

export async function deliverPage(
  slug: string,
  country: CountryCode,
  lang: LanguageCode,
): Promise<CmsPageDto | null> {
  const row = await getLocalizedCmsPageServer(slug, country, lang);
  return row ? mapPage(row) : null;
}

export async function deliverPages(
  country: CountryCode,
  lang: LanguageCode,
): Promise<CmsPageDto[]> {
  const rows = await getLocalizedCmsPagesServer(country, lang);
  return rows.map(mapPage);
}

export async function deliverHomepageSections(
  country: CountryCode,
  lang: LanguageCode,
): Promise<HomepageSectionDto[]> {
  const rows = await getLocalizedHomepageSectionsServer(country, lang);
  return rows.map(mapSection);
}

export async function deliverBlock(
  handle: string,
  country: CountryCode,
  lang: LanguageCode,
): Promise<CmsBlockDto | null> {
  const localeId = toLocaleId(country, lang);
  const row = await getCmsBlockServer(handle, localeId);
  return row ? mapBlock(row) : null;
}

export async function deliverBlocks(
  country: CountryCode,
  lang: LanguageCode,
): Promise<CmsBlockDto[]> {
  const localeId = toLocaleId(country, lang);
  const rows = await getCmsBlocksServer(localeId);
  return rows.map(mapBlock);
}

export async function deliverNavMenu(
  handle: string,
  country: CountryCode,
  lang: LanguageCode,
): Promise<NavMenuDto | null> {
  const localeId = toLocaleId(country, lang);
  const menu = await getNavigationMenuServer(handle, localeId) as NavMenuWithItems | null;
  if (!menu) return null;
  return {
    id:       menu.id,
    handle:   menu.handle,
    name:     menu.name,
    localeId: menu.locale_id,
    items:    menu.items.map(mapNavItem),
  };
}

export async function deliverBanners(
  country: CountryCode,
  lang: LanguageCode,
): Promise<CmsBannerDto[]> {
  const localeId = toLocaleId(country, lang);
  const rows = await getActiveBannersServer(localeId);
  return rows.map(mapBanner);
}
