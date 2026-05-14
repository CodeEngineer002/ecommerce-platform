import { createClient } from "@/lib/supabase/client";
import type { PaginatedResult, ProductFilters, ProductWithDetails } from "@/types";

// Single source of truth for the product join shape
const PRODUCT_SELECT = `
  *,
  category:categories(*),
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
    tags,
  } = filters;

  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT, { count: "exact" })
    .eq("is_active", true);

  // Resolve category slug → id with a join instead of a separate round-trip
  if (category) {
    // Filter by category slug via the join alias — Supabase supports this
    query = query.eq("category.slug", category);
  }

  if (minPrice !== undefined) query = query.gte("base_price", minPrice);
  if (maxPrice !== undefined) query = query.lte("base_price", maxPrice);
  if (isFeatured) query = query.eq("is_featured", true);
  if (tags?.length) query = query.overlaps("tags", tags);

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  switch (sortBy) {
    case "price_asc":
      query = query.order("base_price", { ascending: true });
      break;
    case "price_desc":
      query = query.order("base_price", { ascending: false });
      break;
    case "name_asc":
      query = query.order("name", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
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
  const supabase = createClient();
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .ilike("name", `%${query}%`)
    .order("is_featured", { ascending: false })
    .limit(limit);

  return (data ?? []) as unknown as ProductWithDetails[];
}
