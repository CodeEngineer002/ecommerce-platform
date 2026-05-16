/**
 * Server-side DB helpers for E2E assertions.
 *
 * Uses Supabase service role — ONLY called from Node.js test context, never from
 * browser code. The service role key must be in the environment as
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Production safety: refuses to operate unless the Supabase URL is localhost,
 * or E2E_ALLOW_PRODUCTION=true is explicitly set.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "[E2E DB] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
      "Copy .env.e2e.example → .env.e2e and source it before running tests.",
    );
  }

  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
  if (!isLocal && process.env.E2E_ALLOW_PRODUCTION !== "true") {
    throw new Error(
      `[E2E SAFETY] Refusing DB operations against: ${url}\n` +
      "This looks like a non-local Supabase instance.\n" +
      "Set E2E_ALLOW_PRODUCTION=true ONLY if you are certain this is a disposable test database.",
    );
  }

  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

// ── Order ─────────────────────────────────────────────────────────────────────

export async function getOrder(orderId: string) {
  const { data, error } = await getClient()
    .from("orders")
    .select("id, order_number, status, total, user_id, notes")
    .eq("id", orderId)
    .single();
  if (error) throw new Error(`[E2E DB] getOrder(${orderId}): ${error.message}`);
  return data;
}

export async function findOrderByNumber(orderNumber: string) {
  const { data, error } = await getClient()
    .from("orders")
    .select("id, order_number, status, total, user_id")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw new Error(`[E2E DB] findOrderByNumber(${orderNumber}): ${error.message}`);
  return data;
}

export async function getOrderItems(orderId: string) {
  const { data, error } = await getClient()
    .from("order_items")
    .select("id, variant_id, quantity, unit_price, product_name")
    .eq("order_id", orderId);
  if (error) throw new Error(`[E2E DB] getOrderItems(${orderId}): ${error.message}`);
  return data ?? [];
}

export async function getPaymentForOrder(orderId: string) {
  const { data, error } = await getClient()
    .from("payments")
    .select("id, order_id, provider, status, amount")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(`[E2E DB] getPaymentForOrder(${orderId}): ${error.message}`);
  return data;
}

export async function getOrderEvents(orderId: string) {
  const { data, error } = await getClient()
    .from("order_events")
    .select("id, event_type, description, actor_type, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`[E2E DB] getOrderEvents(${orderId}): ${error.message}`);
  return data ?? [];
}

// ── User / profile ────────────────────────────────────────────────────────────

export async function getUserByEmail(email: string) {
  const { data, error } = await getClient().auth.admin.listUsers();
  if (error) throw new Error(`[E2E DB] listUsers: ${error.message}`);
  return data.users.find((u) => u.email === email) ?? null;
}

export async function getProfileByEmail(email: string) {
  const { data, error } = await getClient()
    .from("profiles")
    .select("id, role, email")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(`[E2E DB] getProfileByEmail(${email}): ${error.message}`);
  return data;
}

// ── Address ───────────────────────────────────────────────────────────────────

export async function getAddressesForUser(userId: string) {
  const { data, error } = await getClient()
    .from("customer_addresses")
    .select("id, first_name, address_line1, city, country_code, is_default_shipping, is_archived")
    .eq("user_id", userId)
    .eq("is_archived", false);
  if (error) throw new Error(`[E2E DB] getAddressesForUser(${userId}): ${error.message}`);
  return data ?? [];
}

// ── E2E cleanup ───────────────────────────────────────────────────────────────

export async function cleanupE2EOrders(): Promise<void> {
  const db = getClient();
  // Orders placed by E2E tests have "[E2E]" in their notes field (set in seed/checkout)
  const { error } = await db.from("orders").delete().like("notes", "%[E2E]%");
  if (error) console.warn("[E2E DB] cleanupE2EOrders failed:", error.message);
}

export async function cleanupE2EAddresses(userId: string): Promise<void> {
  const db = getClient();
  const { error } = await db
    .from("customer_addresses")
    .delete()
    .eq("user_id", userId)
    .like("label", "E2E%");
  if (error) console.warn("[E2E DB] cleanupE2EAddresses failed:", error.message);
}

export async function resetE2ECart(userId: string): Promise<void> {
  const db = getClient();
  const { data: carts } = await db
    .from("carts")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active");
  if (!carts?.length) return;
  for (const cart of carts) {
    await db.from("cart_items").delete().eq("cart_id", cart.id);
    await db.from("carts").update({ status: "abandoned" }).eq("id", cart.id);
  }
}
