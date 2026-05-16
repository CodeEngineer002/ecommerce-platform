/**
 * Migrates the hoodie (FASH-003) from 5 color-only variants to 30 color+size variants.
 * Run: npx ts-node --project tsconfig.seed.json supabase/seed-hoodie-sizes.ts
 *
 * What this does:
 *  1. Fetches existing hoodie product + its 5 color-only variants + images
 *  2. Deletes old variants (inventory cascades; product_images.variant_id → NULL via ON DELETE SET NULL)
 *  3. Creates 30 new variants: 5 colors × 6 sizes, options: { color, size }
 *  4. Inserts inventory with realistic stock (some SKUs are intentionally OOS)
 *  5. Re-links product_images.variant_id to the new "M" variant per color (canonical)
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

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

const COLORS = [
  { name: "Black",    slug: "black",    sku: "FASH-003-BLACK" },
  { name: "Beige",    slug: "beige",    sku: "FASH-003-BEIGE" },
  { name: "Olive",    slug: "olive",    sku: "FASH-003-OLIVE" },
  { name: "Navy",     slug: "navy",     sku: "FASH-003-NAVY"  },
  { name: "Charcoal", slug: "charcoal", sku: "FASH-003-CHARCOAL" },
] as const;

// Realistic per-SKU stock — some XS/XXL intentionally OOS
const STOCK: Record<string, Record<string, number>> = {
  Black:    { XS: 0,  S: 15, M: 25, L: 20, XL: 10, XXL: 5  },
  Beige:    { XS: 8,  S: 12, M: 18, L: 15, XL: 8,  XXL: 0  },
  Olive:    { XS: 5,  S: 10, M: 20, L: 18, XL: 12, XXL: 3  },
  Navy:     { XS: 0,  S: 8,  M: 15, L: 12, XL: 6,  XXL: 2  },
  Charcoal: { XS: 6,  S: 14, M: 22, L: 16, XL: 9,  XXL: 4  },
};

async function run() {
  console.log("Fetching hoodie product (FASH-003)...");

  const { data: product, error: prodErr } = await supabase
    .from("products")
    .select("id, name")
    .eq("sku", "FASH-003")
    .single();

  if (prodErr || !product) {
    console.error("Hoodie product not found:", prodErr?.message);
    return;
  }
  console.log(`Found: ${product.name} (${product.id})`);

  // Fetch existing color-only variants so we can delete them
  const { data: oldVariants, error: varErr } = await supabase
    .from("product_variants")
    .select("id, name, sku")
    .eq("product_id", product.id);

  if (varErr) { console.error("Variant fetch error:", varErr.message); return; }

  const isColorOnly = (oldVariants ?? []).every((v) => {
    const opts = v as unknown as { options?: { color?: string; size?: string } };
    return opts.options?.color && !opts.options?.size;
  });

  if (!isColorOnly && (oldVariants ?? []).length > 0) {
    console.log("Variants already have sizes — checking if re-run is needed...");
    const hasSize = (oldVariants ?? []).some((v) => {
      const opts = v as unknown as { options?: { color?: string; size?: string } };
      return Boolean(opts.options?.size);
    });
    if (hasSize) {
      console.log("Sizes already seeded. Nothing to do.");
      return;
    }
  }

  console.log(`Found ${(oldVariants ?? []).length} existing variants — deleting...`);

  if ((oldVariants ?? []).length > 0) {
    const oldIds = (oldVariants ?? []).map((v) => v.id);

    // Delete inventory first (FK from inventory → product_variants)
    const { error: invErr } = await supabase
      .from("inventory")
      .delete()
      .in("variant_id", oldIds);
    if (invErr) console.warn("  Inventory delete warning:", invErr.message);

    // Delete variants (product_images.variant_id → NULL via ON DELETE SET NULL)
    const { error: delErr } = await supabase
      .from("product_variants")
      .delete()
      .in("id", oldIds);
    if (delErr) { console.error("  Variant delete error:", delErr.message); return; }

    console.log("  Old variants deleted.");
  }

  // Create 30 new variants and collect the "M" variant ID per color for image linking
  const colorToMVariantId: Record<string, string> = {};

  for (const color of COLORS) {
    for (const size of SIZES) {
      const { data: variant, error: vErr } = await supabase
        .from("product_variants")
        .insert({
          product_id: product.id,
          name: `${color.name} / ${size}`,
          sku: `${color.sku}-${size}`,
          price: 2999,
          options: { color: color.name, size },
          is_active: true,
        })
        .select("id")
        .single();

      if (vErr || !variant) {
        console.error(`  Variant insert error (${color.name}/${size}):`, vErr?.message);
        continue;
      }

      const qty = STOCK[color.name]?.[size] ?? 10;
      await supabase.from("inventory").insert({
        variant_id: variant.id,
        quantity: qty,
        reserved: 0,
      });

      if (size === "M") colorToMVariantId[color.name] = variant.id;

      const stockStr = qty === 0 ? "OOS" : `qty=${qty}`;
      console.log(`  Created ${color.name}/${size} (${stockStr})`);
    }
  }

  // Re-link product_images.variant_id to the new "M" variant per color
  console.log("\nLinking images to new canonical (M) variants...");

  const { data: images } = await supabase
    .from("product_images")
    .select("id, alt_text")
    .eq("product_id", product.id);

  for (const color of COLORS) {
    const image = (images ?? []).find((img) =>
      img.alt_text?.toLowerCase().includes(color.name.toLowerCase())
    );
    const mVariantId = colorToMVariantId[color.name];

    if (!image || !mVariantId) {
      console.warn(`  Skipping ${color.name} — image or M-variant not found`);
      continue;
    }

    const { error: linkErr } = await supabase
      .from("product_images")
      .update({ variant_id: mVariantId })
      .eq("id", image.id);

    if (linkErr) console.error(`  Link error (${color.name}):`, linkErr.message);
    else console.log(`  ${color.name} image → variant M (${mVariantId})`);
  }

  console.log("\nHoodie size migration complete! 30 variants created.");
}

run().catch(console.error);
