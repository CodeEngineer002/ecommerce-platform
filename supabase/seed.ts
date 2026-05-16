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

async function seed() {
  console.log("Seeding database...");

  // Categories
  const { data: categories } = await supabase
    .from("categories")
    .insert([
      { name: "Electronics", slug: "electronics", description: "Gadgets and tech", sort_order: 1 },
      { name: "Fashion", slug: "fashion", description: "Clothing and accessories", sort_order: 2 },
      { name: "Home & Living", slug: "home-living", description: "Furniture and decor", sort_order: 3 },
      { name: "Sports", slug: "sports", description: "Fitness and outdoor", sort_order: 4 },
      { name: "Books", slug: "books", description: "Books and stationery", sort_order: 5 },
    ])
    .select();

  if (!categories) {
    console.error("Failed to insert categories");
    return;
  }
  console.log(`Inserted ${categories.length} categories`);

  const electronicsId = categories.find((c) => c.slug === "electronics")!.id;
  const fashionId = categories.find((c) => c.slug === "fashion")!.id;

  // Products
  const { data: products } = await supabase
    .from("products")
    .insert([
      {
        name: "Wireless Noise Cancelling Headphones",
        slug: "wireless-noise-cancelling-headphones",
        description: "Premium over-ear headphones with active noise cancellation, 30-hour battery life.",
        short_desc: "Premium ANC headphones",
        category_id: electronicsId,
        base_price: 8999,
        compare_price: 12999,
        sku: "ELEC-001",
        is_featured: true,
        tags: ["audio", "wireless", "headphones"],
      },
      {
        name: "Smart Watch Pro X",
        slug: "smart-watch-pro-x",
        description: "Full health monitoring smartwatch with GPS, heart rate, SpO2 and 7-day battery.",
        short_desc: "Advanced health smartwatch",
        category_id: electronicsId,
        base_price: 15999,
        compare_price: 21999,
        sku: "ELEC-002",
        is_featured: true,
        tags: ["wearable", "watch", "fitness"],
      },
      {
        name: "Premium Cotton T-Shirt",
        slug: "premium-cotton-tshirt",
        description: "100% organic cotton, relaxed fit, pre-shrunk. Available in 8 colours.",
        short_desc: "Organic cotton tee",
        category_id: fashionId,
        base_price: 799,
        compare_price: 1299,
        sku: "FASH-001",
        is_featured: false,
        tags: ["cotton", "tshirt", "casual"],
      },
      {
        name: "Running Sneakers Ultra",
        slug: "running-sneakers-ultra",
        description: "Lightweight breathable running shoes with energy-return foam midsole.",
        short_desc: "Performance running shoes",
        category_id: fashionId,
        base_price: 5499,
        compare_price: 7999,
        sku: "FASH-002",
        is_featured: true,
        tags: ["shoes", "running", "sports"],
      },
    ])
    .select();

  if (!products) {
    console.error("Failed to insert products");
    return;
  }
  console.log(`Inserted ${products.length} products`);

  // Per-product primary image URLs (Unsplash — relevant to each product)
  const productImageMap: Record<string, string> = {
    "ELEC-001": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800", // headphones
    "ELEC-002": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800", // smart watch
    "FASH-001": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800", // cotton t-shirt
    "FASH-002": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800",  // running sneakers
  };

  // Product variants + inventory
  for (const product of products) {
    const { data: variant } = await supabase
      .from("product_variants")
      .insert({
        product_id: product.id,
        name: "Default",
        sku: `${product.sku}-DEFAULT`,
        price: product.base_price,
        options: {},
      })
      .select()
      .single();

    if (variant) {
      await supabase.from("inventory").insert({
        variant_id: variant.id,
        quantity: Math.floor(Math.random() * 100) + 10,
        reserved: 0,
      });

      const imageUrl = productImageMap[product.sku] ?? "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800";

      await supabase.from("product_images").insert({
        product_id: product.id,
        url: imageUrl,
        alt_text: product.name,
        sort_order: 0,
        is_primary: true,
      });
    }
  }

  console.log("Inserted variants and inventory");

  // Homepage sections
  await supabase.from("homepage_sections").insert([
    {
      type: "hero_banner",
      title: "Summer Sale is Here",
      subtitle: "Up to 50% off on selected items",
      content: {
        cta_text: "Shop Now",
        cta_link: "/products",
        image_url: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1600",
        badge: "Limited Time",
      },
      sort_order: 1,
    },
    {
      type: "featured_products",
      title: "Trending Now",
      subtitle: "Most loved products this week",
      content: { limit: 8 },
      sort_order: 2,
    },
    {
      type: "category_grid",
      title: "Shop by Category",
      content: { show_all: true },
      sort_order: 3,
    },
    {
      type: "promotional_banner",
      title: "Free Shipping",
      subtitle: "On all orders above ₹999",
      content: {
        bg_color: "brand",
        cta_text: "Learn More",
        cta_link: "/shipping",
      },
      sort_order: 4,
    },
  ]);

  console.log("Inserted homepage sections");

  // Coupons
  await supabase.from("coupons").insert([
    {
      code: "WELCOME10",
      description: "10% off for new customers",
      type: "percentage",
      value: 10,
      min_order_value: 500,
      usage_limit: 1000,
      is_active: true,
    },
    {
      code: "FLAT200",
      description: "Flat ₹200 off on orders above ₹1499",
      type: "fixed",
      value: 200,
      min_order_value: 1499,
      usage_limit: 500,
      is_active: true,
    },
  ]);

  console.log("Inserted coupons");
  console.log("Seed complete!");
}

seed().catch(console.error);
