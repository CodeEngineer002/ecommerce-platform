/**
 * One-time script: link each hoodie product_image row to its matching variant.
 * Run: npx ts-node --project tsconfig.seed.json supabase/link-variant-images.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import ws from "ws";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { realtime: { transport: ws as any } }
);

async function run() {
  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("sku", "FASH-003")
    .single();

  if (!product) {
    console.error("Hoodie product (FASH-003) not found.");
    return;
  }

  const { data: variants } = await supabase
    .from("product_variants")
    .select("id, name")
    .eq("product_id", product.id);

  const { data: images } = await supabase
    .from("product_images")
    .select("id, alt_text, sort_order")
    .eq("product_id", product.id)
    .order("sort_order");

  if (!variants?.length || !images?.length) {
    console.error("Missing variants or images for hoodie product.");
    return;
  }

  for (const variant of variants) {
    // alt_text was seeded as "Oversized Premium Hoodie — {Color}"
    const image = images.find((img) =>
      img.alt_text?.toLowerCase().includes(variant.name.toLowerCase())
    );
    if (!image) {
      console.warn(`  No image found for variant "${variant.name}"`);
      continue;
    }
    const { error } = await supabase
      .from("product_images")
      .update({ variant_id: variant.id })
      .eq("id", image.id);

    if (error) {
      console.error(`  Failed linking ${variant.name}:`, error.message);
    } else {
      console.log(`  ${variant.name} → image ${image.id}`);
    }
  }

  console.log("Done.");
}

run().catch(console.error);
