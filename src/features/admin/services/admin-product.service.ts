import { createClient } from "@/lib/supabase/client";
import type { ProductFormData, VariantFormData } from "@/lib/validators";
import type { Product, ProductImage, ProductVariant } from "@/types";

// ── Shared helpers ────────────────────────────────────────────────────────────

async function getDefaultWarehouseId(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("warehouses")
    .select("id")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();
  return data?.id ?? null;
}

const ADMIN_PRODUCT_PAGE_SIZE = 50;

export async function adminGetProducts(page = 1) {
  const supabase = createClient();
  const from = (page - 1) * ADMIN_PRODUCT_PAGE_SIZE;

  const { data, count, error } = await supabase
    .from("products")
    .select(
      `
      *,
      category:categories!products_category_id_fkey(id, name),
      images:product_images(id, url, is_primary, sort_order),
      variants:product_variants(
        id, name, sku, price, is_active, is_default,
        color_code, size_code, barcode, supplier_sku, options,
        inventory_levels(quantity, reserved)
      )
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, from + ADMIN_PRODUCT_PAGE_SIZE - 1);

  if (error) throw error;
  return {
    data: data ?? [],
    count: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / ADMIN_PRODUCT_PAGE_SIZE),
  };
}

export async function adminGetProduct(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `
      *,
      category:categories!products_category_id_fkey(*),
      images:product_images(*, sort_order),
      variants:product_variants(*, inventory_levels(quantity, reserved))
    `
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function adminCreateProduct(data: ProductFormData): Promise<Product> {
  const supabase = createClient();
  const { data: product, error } = await supabase
    .from("products")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return product;
}

export async function adminUpdateProduct(
  id: string,
  data: Partial<ProductFormData>
): Promise<Product> {
  const supabase = createClient();
  const { data: product, error } = await supabase
    .from("products")
    .update(data)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return product;
}

export async function adminDeleteProduct(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadProductImage(productId: string, file: File): Promise<ProductImage> {
  const supabase = createClient();
  const ext = file.name.split(".").pop();
  const fileName = `${productId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(fileName, file, { upsert: false });

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from("product-images").getPublicUrl(fileName);

  // Count existing images to set sort_order
  const { count } = await supabase
    .from("product_images")
    .select("*", { count: "exact", head: true })
    .eq("product_id", productId);

  const { data, error } = await supabase
    .from("product_images")
    .insert({
      product_id: productId,
      url: publicUrl,
      alt_text: file.name.replace(/\.[^/.]+$/, ""),
      sort_order: count ?? 0,
      is_primary: (count ?? 0) === 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteProductImage(imageId: string, url: string): Promise<void> {
  const supabase = createClient();

  // Extract storage path robustly — everything after the bucket name in the URL
  const marker = "/product-images/";
  const markerIdx = url.indexOf(marker);
  if (markerIdx !== -1) {
    const storagePath = url.slice(markerIdx + marker.length);
    // Ignore storage errors (file may already be gone)
    await supabase.storage.from("product-images").remove([storagePath]);
  }

  const { error } = await supabase.from("product_images").delete().eq("id", imageId);
  if (error) throw error;
}

export async function adminCreateVariant(
  productId: string,
  variant: Omit<ProductVariant, "id" | "created_at" | "updated_at">
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("product_variants")
    .insert({ ...variant, product_id: productId })
    .select()
    .single();
  if (error) throw error;

  // inventory_levels is the single source of truth (migration 00017).
  const warehouseId = await getDefaultWarehouseId();
  if (warehouseId) {
    await supabase
      .from("inventory_levels")
      .upsert(
        { warehouse_id: warehouseId, variant_id: data.id, quantity: 0, reserved: 0 },
        { onConflict: "warehouse_id,variant_id" }
      );
  }

  return data;
}

export async function adminUpdateInventory(variantId: string, quantity: number): Promise<void> {
  const supabase = createClient();
  const warehouseId = await getDefaultWarehouseId();
  if (!warehouseId) throw new Error("Default warehouse not found");

  const { error } = await supabase
    .from("inventory_levels")
    .upsert(
      { warehouse_id: warehouseId, variant_id: variantId, quantity, reserved: 0 },
      { onConflict: "warehouse_id,variant_id" }
    );
  if (error) throw error;
}

// ── Variant CRUD ──────────────────────────────────────────────────────────────

export async function adminUpdateVariant(
  variantId: string,
  data: Partial<VariantFormData>
): Promise<ProductVariant> {
  const supabase = createClient();
  const { data: variant, error } = await supabase
    .from("product_variants")
    .update(data)
    .eq("id", variantId)
    .select()
    .single();
  if (error) throw error;
  return variant;
}

export async function adminDeleteVariant(variantId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("product_variants")
    .delete()
    .eq("id", variantId);
  if (error) throw error;
}

// ── Product-level operations ──────────────────────────────────────────────────

export async function adminArchiveProduct(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function adminDuplicateProduct(id: string): Promise<Product> {
  const supabase = createClient();

  // 1. Fetch source product with variants + images
  const { data: source, error: srcErr } = await supabase
    .from("products")
    .select(`
      *,
      images:product_images(url, alt_text, sort_order, is_primary, variant_id),
      variants:product_variants(
        name, sku, price, options, is_active, is_default,
        color_code, size_code, barcode, supplier_sku
      )
    `)
    .eq("id", id)
    .single();
  if (srcErr) throw srcErr;

  // 2. Clone the product row with a new slug / name and clear product_code (must be unique)
  const { id: _id, created_at: _ca, updated_at: _ua, deleted_at: _da, ...productFields } = source as Record<string, unknown>;
  const timestamp = Date.now();
  const newSlug = `${(productFields.slug as string)}-copy-${timestamp}`;

  const { data: newProduct, error: insertErr } = await supabase
    .from("products")
    .insert({
      ...productFields,
      name: `${productFields.name as string} (Copy)`,
      slug: newSlug,
      product_code: null, // must be manually set — unique constraint
      is_active: false,   // start as Draft
      deleted_at: null,
    })
    .select()
    .single();
  if (insertErr) throw insertErr;

  // 3. Clone images (re-use existing storage URLs — no re-upload cost)
  const images = (source as { images?: Array<Record<string, unknown>> }).images ?? [];
  if (images.length > 0) {
    await supabase.from("product_images").insert(
      images.map((img) => ({ ...img, product_id: newProduct.id }))
    );
  }

  // 4. Clone variants + create inventory rows
  const variants = (source as { variants?: Array<Record<string, unknown>> }).variants ?? [];
  const warehouseId = await getDefaultWarehouseId();

  for (const v of variants) {
    const newSku = v.sku ? `${v.sku as string}-COPY` : null;
    const { data: newVariant, error: vErr } = await supabase
      .from("product_variants")
      .insert({ ...v, product_id: newProduct.id, sku: newSku, barcode: null })
      .select()
      .single();
    if (vErr) continue; // skip on conflict (sku uniqueness)

    if (warehouseId) {
      await supabase
        .from("inventory_levels")
        .upsert(
          { warehouse_id: warehouseId, variant_id: newVariant.id, quantity: 0, reserved: 0 },
          { onConflict: "warehouse_id,variant_id" }
        );
    }
  }

  return newProduct;
}

// ── Image reorder ─────────────────────────────────────────────────────────────

export async function adminReorderImages(
  updates: Array<{ id: string; sort_order: number; is_primary: boolean }>
): Promise<void> {
  const supabase = createClient();
  await Promise.all(
    updates.map(({ id, sort_order, is_primary }) =>
      supabase
        .from("product_images")
        .update({ sort_order, is_primary })
        .eq("id", id)
    )
  );
}

export async function adminUpdateImageAltText(imageId: string, altText: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("product_images")
    .update({ alt_text: altText })
    .eq("id", imageId);
  if (error) throw error;
}

export async function adminAssignImageToVariant(
  imageId: string,
  variantId: string | null
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("product_images")
    .update({ variant_id: variantId })
    .eq("id", imageId);
  if (error) throw error;
}
