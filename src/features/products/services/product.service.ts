import { createClient } from "@/lib/supabase/client";
import type { PaginatedResult, ProductFilters, ProductWithDetails } from "@/types";

// Single source of truth for the product join shape (used by API route, kept here for reference)
export const PRODUCT_SELECT = `
  *,
  category:categories!products_category_id_fkey(*),
  images:product_images(*),
  variants:product_variants(*, inventory(*))
` as const;

export async function getProducts(
  filters: ProductFilters = {}
): Promise<PaginatedResult<ProductWithDetails>> {
  const supabase = createClient();
  const {
    category,
    minPrice,
    maxPrice,
    search,
    isFeatured,
    sortBy = "newest",
    page = 1,
    pageSize = 12,
    countryId,
  } = filters;

  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT, { count: "exact" })
    .eq("is_active", true);

  if (countryId) {
    query = query.or(
      `available_country_ids.eq.{},available_country_ids.cs.{${countryId}}`
    );
  }

  if (category) {
    query = query.eq("category.slug", category);
  }

  if (minPrice !== undefined) query = query.gte("base_price", minPrice);
  if (maxPrice !== undefined) query = query.lte("base_price", maxPrice);
  if (isFeatured) query = query.eq("is_featured", true);

  if (search && search.trim().length >= 2) {
    const safe = search.trim().replace(/[\\%_]/g, "\\$&");
    query = query.ilike("name", `%${safe}%`);
  }

  switch (sortBy) {
    case "price_asc":  query = query.order("base_price", { ascending: true });  break;
    case "price_desc": query = query.order("base_price", { ascending: false }); break;
    case "name_asc":   query = query.order("name",       { ascending: true });  break;
    default:           query = query.order("created_at", { ascending: false }); break;
  }

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    data:       (data ?? []) as unknown as ProductWithDetails[],
    count:      count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  };
}

/**
 * Returns products that have a compare_at (sale) price set at either the
 * product-price or variant-price level.
 *
 * compare_at lives on `product_prices` and `variant_prices` — NOT on
 * `product_variants` directly. We do a two-step query to avoid a 400 from
 * PostgREST when filtering on a non-existent column.
 */
export async function getSaleProducts(
  filters: Pick<ProductFilters, "page" | "pageSize" | "sortBy" | "countryId"> = {}
): Promise<PaginatedResult<ProductWithDetails>> {
  const supabase = createClient();
  const { page = 1, pageSize = 12, sortBy = "newest", countryId } = filters;

  // Step 1: collect product IDs that have a compare_at price set (parallel)
  const [{ data: prodPrices }, { data: varPrices }] = await Promise.all([
    supabase.from("product_prices").select("product_id").not("compare_at", "is", null),
    supabase.from("variant_prices").select("variant_id").not("compare_at", "is", null),
  ]);

  const productIdSet = new Set<string>();

  // Direct product-level compare_at
  (prodPrices ?? []).forEach((p) => productIdSet.add(p.product_id as string));

  // Variant-level compare_at — resolve variant_id → product_id
  if (varPrices && varPrices.length > 0) {
    const variantIds = varPrices.map((v) => v.variant_id as string);
    const { data: variants } = await supabase
      .from("product_variants")
      .select("product_id")
      .in("id", variantIds);
    (variants ?? []).forEach((v) => productIdSet.add(v.product_id as string));
  }

  const productIds = [...productIdSet];

  if (productIds.length === 0) {
    return { data: [], count: 0, page, pageSize, totalPages: 0 };
  }

  // Step 2: fetch those products with full join
  let query = supabase
    .from("products")
    .select(
      `*, category:categories!products_category_id_fkey(*), images:product_images(*), variants:product_variants(*, inventory(*))`,
      { count: "exact" },
    )
    .eq("is_active", true)
    .in("id", productIds);

  if (countryId) {
    query = query.or(
      `available_country_ids.eq.{},available_country_ids.cs.{${countryId}}`
    );
  }

  switch (sortBy) {
    case "price_asc":  query = query.order("base_price", { ascending: true }); break;
    case "price_desc": query = query.order("base_price", { ascending: false }); break;
    case "name_asc":   query = query.order("name", { ascending: true }); break;
    default:           query = query.order("created_at", { ascending: false });
  }

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    data: (data ?? []) as unknown as ProductWithDetails[],
    count: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  };
}

export async function getProductBySlug(slug: string): Promise<ProductWithDetails | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error) return null;
  return data as unknown as ProductWithDetails;
}

export async function getFeaturedProducts(limit = 8): Promise<ProductWithDetails[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .eq("is_featured", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as unknown as ProductWithDetails[];
}

export async function getRelatedProducts(
  productId: string,
  categoryId: string | null,
  limit = 4
): Promise<ProductWithDetails[]> {
  const supabase = createClient();
  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .neq("id", productId)
    .limit(limit);

  if (categoryId) query = query.eq("category_id", categoryId);

  const { data } = await query;
  return (data ?? []) as unknown as ProductWithDetails[];
}

export async function searchProducts(query: string, limit = 20): Promise<ProductWithDetails[]> {
  const result = await getProducts({ search: query, pageSize: limit, sortBy: "newest" });
  return result.data;
}
