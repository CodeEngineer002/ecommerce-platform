import { createClient } from "@/lib/supabase/client";
import type { ProductFormData } from "@/lib/validators";
import type { Product, ProductImage, ProductVariant } from "@/types";

const ADMIN_PRODUCT_PAGE_SIZE = 20;

export async function adminGetProducts(page = 1) {
  const supabase = createClient();
  const from = (page - 1) * ADMIN_PRODUCT_PAGE_SIZE;

  const { data, count, error } = await supabase
    .from("products")
    .select(
      `
      *,
      category:categories(id, name),
      images:product_images(id, url, is_primary, sort_order),
      variants:product_variants(id, name, sku, price, is_active, inventory(quantity, reserved))
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
      category:categories(*),
      images:product_images(*, sort_order),
      variants:product_variants(*, inventory(*))
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

  await supabase.from("inventory").insert({ variant_id: data.id, quantity: 0, reserved: 0 });
  return data;
}

export async function adminUpdateInventory(variantId: string, quantity: number): Promise<void> {
  const supabase = createClient();
  // update (not upsert) because inventory row is created with the variant
  const { error } = await supabase
    .from("inventory")
    .update({ quantity })
    .eq("variant_id", variantId);
  if (error) throw error;
}
