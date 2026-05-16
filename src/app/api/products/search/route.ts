import { z } from "zod";

import { apiSuccess, withApiHandler } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";
import type { PaginatedResult, ProductWithDetails } from "@/types";

// ── Query param schema ────────────────────────────────────────────────────────
const searchSchema = z.object({
  q:         z.string().max(200).optional(),
  category:  z.string().max(100).optional(),
  minPrice:  z.coerce.number().min(0).optional(),
  maxPrice:  z.coerce.number().min(0).optional(),
  sort:      z.enum(["newest", "price_asc", "price_desc", "name_asc", "rating"]).default("newest"),
  page:      z.coerce.number().int().min(1).default(1),
  pageSize:  z.coerce.number().int().min(1).max(48).default(12),
  country:   z.string().max(10).optional(),
  featured:  z.enum(["true", "false"]).optional(),
});

// Shared join shape — mirrors product.service.ts PRODUCT_SELECT
const PRODUCT_SELECT = `
  *,
  category:categories!products_category_id_fkey(*),
  images:product_images(*),
  variants:product_variants(*, inventory(*))
` as const;

export const GET = withApiHandler(async (request: Request) => {
  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());

  const params = searchSchema.parse(raw);
  const { q, category, minPrice, maxPrice, sort, page, pageSize, country, featured } = params;

  const db = createServiceClient();

  let query = db
    .from("products")
    .select(PRODUCT_SELECT, { count: "exact" })
    .eq("is_active", true);

  // ── Name-only search — precise, predictable results (“premium” matches product
  // names containing “premium”; description matching causes confusing false positives)
  if (q && q.trim().length >= 2) {
    const safe = q.trim().replace(/[\\%_]/g, "\\$&");
    query = query.ilike("name", `%${safe}%`);
  }

  // ── Category filter (slug → join) ─────────────────────────────────────────
  if (category) {
    query = query.eq("category.slug", category);
  }

  // ── Price range ───────────────────────────────────────────────────────────
  if (minPrice !== undefined) query = query.gte("base_price", minPrice);
  if (maxPrice !== undefined) query = query.lte("base_price", maxPrice);

  // ── Featured filter ───────────────────────────────────────────────────────
  if (featured === "true") query = query.eq("is_featured", true);

  // ── Country availability ──────────────────────────────────────────────────
  // available_country_ids = '{}' means all countries
  if (country) {
    query = query.or(
      `available_country_ids.eq.{},available_country_ids.cs.{${country}}`
    );
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  switch (sort) {
    case "price_asc":  query = query.order("base_price", { ascending: true });  break;
    case "price_desc": query = query.order("base_price", { ascending: false }); break;
    case "name_asc":   query = query.order("name",       { ascending: true });  break;
    case "rating":     query = query.order("created_at", { ascending: false }); break; // fallback until avg_rating column
    default:           query = query.order("created_at", { ascending: false }); break;
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  const result: PaginatedResult<ProductWithDetails> = {
    data:       (data ?? []) as unknown as ProductWithDetails[],
    count:      count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  };

  return apiSuccess(result);
});
