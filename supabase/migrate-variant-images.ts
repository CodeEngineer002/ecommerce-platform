/**
 * Migration: add variant_id to product_images + link hoodie images to their variants.
 * Run once: npx ts-node --project tsconfig.seed.json supabase/migrate-variant-images.ts
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
  // ── Step 1: Add variant_id column via DDL ─────────────────────────────────
  // Supabase REST does not expose raw DDL — use the pg extension RPC if available,
  // otherwise fall back to the SQL editor approach. We call the built-in pg helper.
  console.log("Step 1: applying DDL migration via Supabase SQL API...");

  const ddlRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/run_migration`,
    {
      method: "POST",
      headers: {
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY!,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql: `
          ALTER TABLE product_images
            ADD COLUMN IF NOT EXISTS variant_id UUID
              REFERENCES product_variants(id) ON DELETE SET NULL;
          CREATE INDEX IF NOT EXISTS idx_product_images_variant_id
            ON product_images(variant_id);
        `,
      }),
    }
  );

  if (!ddlRes.ok) {
    // Supabase doesn't expose raw DDL via REST — we'll use the service-role client
    // workaround: insert a dummy row to check the column exists, or handle gracefully.
    console.log("DDL RPC not available — column may need to be added via Supabase Dashboard SQL editor.");
    console.log("SQL to run:");
    console.log(`
ALTER TABLE product_images
  ADD COLUMN IF NOT EXISTS variant_id UUID
    REFERENCES product_variants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_product_images_variant_id
  ON product_images(variant_id);
    `);
  } else {
    console.log("DDL applied successfully.");
  }

  // ── Step 2: Link hoodie images to their variants ──────────────────────────
  console.log("\nStep 2: linking hoodie images to variants...");

  // Fetch the hoodie product
  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("sku", "FASH-003")
    .single();

  if (!product) {
    console.error("Hoodie product not found (FASH-003). Run seed-hoodies.ts first.");
    return;
  }

  // Fetch its variants ordered by name
  const { data: variants } = await supabase
    .from("product_variants")
    .select("id, name")
    .eq("product_id", product.id)
    .order("name");

  // Fetch its images ordered by sort_order
  const { data: images } = await supabase
    .from("product_images")
    .select("id, alt_text, sort_order")
    .eq("product_id", product.id)
    .order("sort_order");

  if (!variants?.length || !images?.length) {
    console.error("No variants or images found for hoodie product.");
    return;
  }

  console.log("Variants:", variants.map((v) => v.name));
  console.log("Images:", images.map((i) => i.alt_text));

  // Match image to variant by color name in alt_text
  const colorOrder = ["Black", "Beige", "Olive", "Navy", "Charcoal"];

  for (const color of colorOrder) {
    const variant = variants.find((v) => v.name === color);
    const image = images.find((img) =>
      img.alt_text?.toLowerCase().includes(color.toLowerCase())
    );

    if (!variant || !image) {
      console.warn(`  Could not match color "${color}" — variant: ${variant?.id ?? "missing"}, image: ${image?.id ?? "missing"}`);
      continue;
    }

    const { error } = await supabase
      .from("product_images")
      .update({ variant_id: variant.id })
      .eq("id", image.id);

    if (error) {
      console.error(`  Failed to link ${color}:`, error.message);
    } else {
      console.log(`  Linked ${color} image → variant ${variant.id}`);
    }
  }

  console.log("\nMigration complete.");
}

run().catch(console.error);
