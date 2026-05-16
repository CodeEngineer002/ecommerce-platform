/**
 * E2E seed script — creates deterministic test users and supporting data.
 *
 * Run before first E2E test run:
 *   npm run db:seed:e2e
 *
 * Clean up E2E test data:
 *   npm run db:seed:e2e:cleanup
 *
 * Safety: refuses to run against a production Supabase URL unless
 * E2E_ALLOW_PRODUCTION=true is explicitly set.
 *
 * Idempotent: re-running is safe — existing records are skipped.
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import ws from "ws";

dotenv.config({ path: ".env.e2e" });
dotenv.config({ path: ".env.local" }); // fallback for local dev

// ── Safety guard ──────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[e2e-seed] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  console.error("[e2e-seed] Copy .env.e2e.example → .env.e2e and fill in your local values.");
  process.exit(1);
}

const isLocal = SUPABASE_URL.includes("localhost") || SUPABASE_URL.includes("127.0.0.1");
if (!isLocal && process.env.E2E_ALLOW_PRODUCTION !== "true") {
  console.error(`[e2e-seed] REFUSING to seed against: ${SUPABASE_URL}`);
  console.error("[e2e-seed] This looks like a non-local Supabase instance.");
  console.error("[e2e-seed] Set E2E_ALLOW_PRODUCTION=true only if you are certain this is a disposable test DB.");
  process.exit(1);
}

// ── Supabase admin client ──────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(SUPABASE_URL, SERVICE_KEY, { realtime: { transport: ws as any } });

// ── Test credentials ───────────────────────────────────────────────────────────
const CUSTOMER_EMAIL    = process.env.TEST_CUSTOMER_EMAIL    ?? "e2e-customer@test.shopnest.local";
const CUSTOMER_PASSWORD = process.env.TEST_CUSTOMER_PASSWORD ?? "TestCustomer123!";
const ADMIN_EMAIL       = process.env.TEST_ADMIN_EMAIL       ?? "e2e-admin@test.shopnest.local";
const ADMIN_PASSWORD    = process.env.TEST_ADMIN_PASSWORD    ?? "TestAdmin123!";
const COUNTRY_CODE      = process.env.TEST_COUNTRY_CODE      ?? "IN";

// ── Helpers ────────────────────────────────────────────────────────────────────
async function upsertUser(email: string, password: string, role: "customer" | "admin") {
  // Check if user already exists
  const { data: existing } = await db.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email === email);

  let userId: string;

  if (found) {
    userId = found.id;
    console.log(`  [skip] Auth user already exists: ${email}`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no email verification needed for tests
    });
    if (error || !data.user) {
      throw new Error(`Failed to create user ${email}: ${error?.message}`);
    }
    userId = data.user.id;
    console.log(`  [created] Auth user: ${email} (${userId})`);
  }

  // Upsert profile
  const { error: profileError } = await db.from("profiles").upsert(
    { id: userId, email, role },
    { onConflict: "id" },
  );
  if (profileError) {
    console.warn(`  [warn] Profile upsert for ${email}: ${profileError.message}`);
  }

  return userId;
}

async function upsertCustomerAddress(userId: string): Promise<string> {
  const { data: existing } = await db
    .from("customer_addresses")
    .select("id")
    .eq("user_id", userId)
    .eq("label", "E2E Default")
    .maybeSingle();

  if (existing?.id) {
    console.log(`  [skip] Address already exists for customer`);
    return existing.id;
  }

  const { data, error } = await db
    .from("customer_addresses")
    .insert({
      user_id:             userId,
      first_name:          "E2E",
      last_name:           "TestUser",
      address_line1:       "123 E2E Test Street",
      address_line2:       null,
      city:                "Mumbai",
      state:               "MH",
      country_code:        COUNTRY_CODE,
      postal_code:         "400001",
      phone:               "+919876543210",
      label:               "E2E Default",
      is_default_shipping: true,
      is_default_billing:  true,
      is_archived:         false,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create test address: ${error?.message}`);
  }
  console.log(`  [created] Customer address: Mumbai, IN (${data.id})`);
  return data.id;
}

// ── Cleanup ────────────────────────────────────────────────────────────────────
async function cleanup() {
  console.log("\n[e2e-seed] Cleaning up E2E test data...");

  // Remove E2E orders (identified by [E2E] in notes)
  const { error: ordErr } = await db.from("orders").delete().like("notes", "%[E2E]%");
  if (ordErr) console.warn("  order cleanup:", ordErr.message);
  else console.log("  [done] E2E orders removed");

  // Remove E2E addresses
  const { error: addrErr } = await db
    .from("customer_addresses")
    .delete()
    .eq("label", "E2E Default");
  if (addrErr) console.warn("  address cleanup:", addrErr.message);
  else console.log("  [done] E2E addresses removed");

  // Note: We do NOT delete the test auth users as they are needed for future runs.
  // Use `npm run db:reset` to wipe everything.

  console.log("[e2e-seed] Cleanup complete.\n");
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function seed() {
  if (process.env.E2E_CLEANUP === "true") {
    await cleanup();
    return;
  }

  console.log("\n[e2e-seed] Seeding E2E test data...");
  console.log(`  Target: ${SUPABASE_URL}`);

  // 1. E2E customer
  console.log("\n[e2e-seed] Creating test customer...");
  const customerId = await upsertUser(CUSTOMER_EMAIL, CUSTOMER_PASSWORD, "customer");
  await upsertCustomerAddress(customerId);

  // 2. E2E admin
  console.log("\n[e2e-seed] Creating test admin...");
  await upsertUser(ADMIN_EMAIL, ADMIN_PASSWORD, "admin");

  // 3. Verify a test product exists (from main seed)
  const { data: product } = await db
    .from("products")
    .select("id, name, slug")
    .eq("slug", process.env.TEST_PRODUCT_SLUG ?? "wireless-noise-cancelling-headphones")
    .maybeSingle();

  if (!product) {
    console.warn("\n  [warn] Test product not found in DB.");
    console.warn("  Run `npm run db:seed` first to seed products, then re-run this script.");
  } else {
    console.log(`\n  [ok] Test product exists: ${product.name}`);
  }

  // 4. Verify test product has active inventory
  if (product) {
    const { data: variants } = await db
      .from("product_variants")
      .select("id, sku, inventory(quantity, reserved)")
      .eq("product_id", product.id)
      .eq("is_active", true);

    const hasStock = variants?.some((v) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inv = (v.inventory as any) ?? {};
      return (inv.quantity ?? 0) - (inv.reserved ?? 0) > 0;
    });

    if (!hasStock) {
      console.warn("  [warn] Test product has no available stock. Checkout tests may fail.");
      console.warn("  Run `npm run db:seed` to reset inventory.");
    } else {
      console.log("  [ok] Test product has available stock");
    }
  }

  console.log("\n[e2e-seed] Seed complete!");
  console.log(`  Customer: ${CUSTOMER_EMAIL} / ${CUSTOMER_PASSWORD}`);
  console.log(`  Admin:    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log("\nNext steps:");
  console.log("  1. Start dev server: npm run dev");
  console.log("  2. Run E2E tests:    npm run test:e2e");
}

seed().catch((err) => {
  console.error("[e2e-seed] Fatal error:", err.message);
  process.exit(1);
});
