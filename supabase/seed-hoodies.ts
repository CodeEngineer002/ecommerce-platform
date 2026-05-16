import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import ws from "ws";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { realtime: { transport: ws as any } }
);

const COLORS = [
  { name: "Black",    slug: "black",    sku: "FASH-003-BLACK" },
  { name: "Beige",    slug: "beige",    sku: "FASH-003-BEIGE" },
  { name: "Olive",    slug: "olive",    sku: "FASH-003-OLIVE" },
  { name: "Navy",     slug: "navy",     sku: "FASH-003-NAVY"  },
  { name: "Charcoal", slug: "charcoal", sku: "FASH-003-CHARCOAL" },
];

const IMAGE_DIR = path.join(__dirname, "../public/product-images/hoodies");

async function uploadImage(slug: string): Promise<string> {
  const filePath = path.join(IMAGE_DIR, `hoodie-${slug}.png`);
  const fileBuffer = fs.readFileSync(filePath);
  const storagePath = `hoodies/hoodie-${slug}.png`;

  const { error } = await supabase.storage
    .from("product-images")
    .upload(storagePath, fileBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) throw new Error(`Upload failed for ${slug}: ${error.message}`);

  const { data } = supabase.storage.from("product-images").getPublicUrl(storagePath);
  return data.publicUrl;
}

async function seedHoodies() {
  console.log("Seeding hoodie product...");

  // Fetch existing fashion category
  const { data: category, error: catError } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", "fashion")
    .single();

  if (catError || !category) {
    console.error("Fashion category not found — run the main seed first.");
    return;
  }

  // Upload images and collect public URLs
  console.log("Uploading images to storage...");
  const imageUrls: Record<string, string> = {};
  for (const color of COLORS) {
    const url = await uploadImage(color.slug);
    imageUrls[color.slug] = url;
    console.log(`  Uploaded ${color.name}: ${url}`);
  }

  // Insert product
  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      name: "Oversized Premium Hoodie",
      slug: "oversized-premium-hoodie",
      description:
        "Ultra-soft heavyweight fleece hoodie with a relaxed oversized fit. Double-lined hood, kangaroo pocket, and ribbed cuffs. Available in 5 muted tones — built to layer season after season.",
      short_desc: "Heavyweight oversized fleece hoodie — 5 colours",
      category_id: category.id,
      base_price: 2999,
      compare_price: 4499,
      sku: "FASH-003",
      is_featured: true,
      tags: ["hoodie", "oversized", "fleece", "casual", "fashion"],
    })
    .select()
    .single();

  if (productError || !product) {
    console.error("Failed to insert product:", productError?.message);
    return;
  }
  console.log(`Inserted product: ${product.name} (${product.id})`);

  // Insert variants + inventory + images
  for (let i = 0; i < COLORS.length; i++) {
    const color = COLORS[i];

    const { data: variant, error: variantError } = await supabase
      .from("product_variants")
      .insert({
        product_id: product.id,
        name: color.name,
        sku: color.sku,
        price: 2999,
        options: { color: color.name },
      })
      .select()
      .single();

    if (variantError || !variant) {
      console.error(`Failed to insert variant ${color.name}:`, variantError?.message);
      continue;
    }

    await supabase.from("inventory").insert({
      variant_id: variant.id,
      quantity: 50,
      reserved: 0,
    });

    await supabase.from("product_images").insert({
      product_id: product.id,
      url: imageUrls[color.slug],
      alt_text: `Oversized Premium Hoodie — ${color.name}`,
      sort_order: i,
      is_primary: i === 0,
    });

    console.log(`  Inserted variant + inventory + image: ${color.name}`);
  }

  console.log("Hoodie seed complete!");
}

seedHoodies().catch(console.error);
