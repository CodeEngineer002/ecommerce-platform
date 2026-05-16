/**
 * Playwright global teardown — runs automatically after ALL E2E tests finish.
 *
 * This file is wired into playwright.config.ts via `globalTeardown`.
 * It runs whether tests pass or fail, so test data is always cleaned up.
 *
 * What it cleans:
 *   - Orders with [E2E] in notes
 *   - Customer addresses labelled "E2E Default"
 *   - Active carts belonging to E2E test users
 *
 * What it keeps:
 *   - The test user accounts (e2e-customer, e2e-admin) — reused between runs
 *
 * To skip cleanup (e.g. for debugging a failure):
 *   E2E_SKIP_CLEANUP=true npm run test:e2e
 */
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.e2e" });
dotenv.config({ path: ".env.local" });

async function globalTeardown() {
  if (process.env.E2E_SKIP_CLEANUP === "true") {
    console.log("\n[E2E teardown] Skipped (E2E_SKIP_CLEANUP=true)");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn("[E2E teardown] Missing Supabase credentials — skipping cleanup");
    return;
  }

  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
  if (!isLocal && process.env.E2E_ALLOW_PRODUCTION !== "true") {
    console.warn("[E2E teardown] Non-local Supabase detected — skipping cleanup (set E2E_ALLOW_PRODUCTION=true to enable)");
    return;
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  console.log("\n[E2E teardown] Cleaning up test data...");

  // 1. Remove E2E orders (tagged with [E2E] in notes)
  const { error: ordErr, count: ordCount } = await db
    .from("orders")
    .delete({ count: "exact" })
    .like("notes", "%[E2E]%");

  if (ordErr) console.warn("  [warn] Order cleanup:", ordErr.message);
  else console.log(`  ✓ Orders removed: ${ordCount ?? 0}`);

  // 2. Find E2E test user IDs
  const customerEmail = process.env.TEST_CUSTOMER_EMAIL ?? "e2e-customer@test.shopnest.local";
  const adminEmail    = process.env.TEST_ADMIN_EMAIL    ?? "e2e-admin@test.shopnest.local";

  const { data: profiles } = await db
    .from("profiles")
    .select("id")
    .in("email", [customerEmail, adminEmail]);

  const userIds = (profiles ?? []).map((p: { id: string }) => p.id);

  // 3. Remove E2E addresses
  const { error: addrErr, count: addrCount } = await db
    .from("customer_addresses")
    .delete({ count: "exact" })
    .eq("label", "E2E Default");

  if (addrErr) console.warn("  [warn] Address cleanup:", addrErr.message);
  else console.log(`  ✓ Addresses removed: ${addrCount ?? 0}`);

  // 4. Abandon active carts for test users
  if (userIds.length > 0) {
    const { error: cartErr, count: cartCount } = await db
      .from("carts")
      .update({ status: "abandoned" })
      .in("user_id", userIds)
      .eq("status", "active");

    if (cartErr) console.warn("  [warn] Cart cleanup:", cartErr.message);
    else console.log(`  ✓ Carts abandoned: ${cartCount ?? 0}`);

    // 5. Clear cart items for those carts
    const { data: abandonedCarts } = await db
      .from("carts")
      .select("id")
      .in("user_id", userIds)
      .eq("status", "abandoned");

    if (abandonedCarts?.length) {
      const cartIds = abandonedCarts.map((c: { id: string }) => c.id);
      await db.from("cart_items").delete().in("cart_id", cartIds);
    }
  }

  console.log("[E2E teardown] Done.\n");
}

export default globalTeardown;
