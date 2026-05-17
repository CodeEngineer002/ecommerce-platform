import { z } from "zod";

import { CouponError, validateCoupon } from "@/domain/coupon/coupon-engine";
import { calculatePricing } from "@/domain/pricing/pricing-engine";
import type { LineItem } from "@/domain/pricing/types";
import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { CURRENCY } from "@/lib/constants";
import { AuthError, InventoryError, NotFoundError } from "@/lib/errors";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { getPaymentProvider } from "@/lib/payment";
import { perfMark } from "@/lib/perf";
import { withRateLimit } from "@/lib/rate-limit";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getTaxConfig } from "@/lib/tax/tax-service";
import { addressSchema } from "@/lib/validators";

// ── Request schema ────────────────────────────────────────────────────────────
const cartItemSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(10),
});

const orderRequestSchema = z.object({
  cartItems: z.array(cartItemSchema).min(1, "Cart is empty").max(50),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  couponCode: z.string().max(30).optional(),
  // razorpay excluded until webhook handler is implemented
  paymentProvider: z.enum(["stripe", "cod"]),
  notes: z.string().max(500).optional(),
  // cartId — used to convert the specific cart used at checkout,
  // preventing stale-cart / double-order issues.
  cartId: z.string().uuid().optional(),
});

// ── Query result types ────────────────────────────────────────────────────────
type ProductRow = { id: string; name: string; base_price: number; product_code: string | null };
type VariantRow = {
  id: string;
  sku: string | null;
  price: number | null;
  is_active: boolean;
  options: Record<string, string> | null;
  product: ProductRow | ProductRow[] | null;
};

function resolveProduct(product: ProductRow | ProductRow[] | null): ProductRow | null {
  if (!product) return null;
  return Array.isArray(product) ? (product[0] ?? null) : product;
}

function getVariantPrice(variant: VariantRow): number {
  const product = resolveProduct(variant.product);
  return variant.price ?? product?.base_price ?? 0;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export const POST = withRateLimit(
  withApiHandler(async (request: Request) => {
    const end = perfMark("POST /api/orders/create");
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) { end(); throw new AuthError(); }

    const body: unknown = await request.json();
    const parsed = orderRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "Invalid request",
        400,
        "VALIDATION_ERROR",
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const { cartItems, shippingAddress, billingAddress, couponCode, paymentProvider, notes, cartId } =
      parsed.data;

    const db = createServiceClient();

    // ── Idempotency key — prevents duplicate orders on client retry ───────────
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (idempotencyKey) {
      const { data: existing } = await db
        .from("idempotency_keys")
        .select("response_body")
        .eq("key", `order:${idempotencyKey}`)
        .maybeSingle();

      if (existing?.response_body) {
        return apiSuccess(existing.response_body as Record<string, unknown>);
      }
    }

    // ── Fetch authoritative prices — never trust client-submitted prices ──────
    // inventory is NOT fetched here; the hard stock check happens inside
    // create_order_atomic with a SELECT FOR UPDATE lock.
    // Also fetch sku, options (color/size) and product_code for order snapshot.
    const variantIds = cartItems.map((i) => i.variant_id);
    const { data: variantsRaw, error: variantError } = await db
      .from("product_variants")
      .select("id, sku, price, is_active, options, product:products(id, name, base_price, product_code)")
      .in("id", variantIds);

    if (variantError || !variantsRaw) throw new Error("Failed to fetch product variants");

    const variants = variantsRaw as VariantRow[];

    for (const item of cartItems) {
      const variant = variants.find((v) => v.id === item.variant_id);
      if (!variant || !variant.is_active) {
        throw new NotFoundError(`Product variant ${item.variant_id} is unavailable`);
      }
    }

    // ── Build line items for pricing engine ──────────────────────────────────
    const lineItems: LineItem[] = cartItems.map((item) => {
      const variant = variants.find((v) => v.id === item.variant_id)!;
      const product = resolveProduct(variant.product);
      return {
        variantId: item.variant_id,
        quantity: item.quantity,
        unitPrice: getVariantPrice(variant),
        productName: product?.name ?? "Unknown",
      };
    });

    // ── Validate coupon (soft pre-flight — hard lock happens inside RPC) ──────
    let couponData = null;
    if (couponCode) {
      const subtotal = lineItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      couponData = await validateCoupon(couponCode, subtotal, user.id);
    }

    // ── Resolve country-specific tax rate from shipping address ───────────────
    const taxConfig = getTaxConfig(shippingAddress.country);

    // ── Calculate pricing server-side ────────────────────────────────────────
    const pricing = calculatePricing(lineItems, couponData, undefined, taxConfig);

    // ── Build cart items payload for atomic RPC ───────────────────────────────
    // snapshot captures product_code + sku + color/size so order history is
    // resilient to future catalog changes (ADR-002: order immutability via snapshots).
    const atomicCartItems = cartItems.map((item) => {
      const variant = variants.find((v) => v.id === item.variant_id)!;
      const product = resolveProduct(variant.product);
      const unitPrice = getVariantPrice(variant);
      const opts = (variant.options ?? {}) as Record<string, string>;
      return {
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: unitPrice,
        product_name: product?.name ?? "Unknown",
        sku: variant.sku ?? null,
        snapshot: {
          variant_id: item.variant_id,
          product_id: product?.id ?? null,
          product_code: product?.product_code ?? null,
          sku: variant.sku ?? null,
          color: opts.color ?? null,
          size: opts.size ?? null,
          price_at_purchase: unitPrice,
        },
      };
    });

    // ── Atomic order creation (inventory lock + order + items + coupon in one tx)
    const { data: orderId, error: rpcError } = await db.rpc("create_order_atomic", {
      p_user_id: user.id,
      p_cart_items: atomicCartItems,
      p_subtotal: pricing.subtotal,
      p_tax: pricing.tax,
      p_shipping: pricing.shipping,
      p_discount: pricing.discount,
      p_total: pricing.total,
      p_coupon_id: (couponData?.id ?? null) as string,
      p_coupon_code: couponCode?.toUpperCase() ?? "",
      p_shipping_address: shippingAddress,
      p_billing_address: billingAddress ?? shippingAddress,
      p_notes: notes ?? "",
    });

    if (rpcError || !orderId) {
      const msg = rpcError?.message ?? "";
      if (msg.includes("Insufficient stock") || rpcError?.code === "P0001") {
        throw new InventoryError("Insufficient stock. Please refresh your cart and try again.");
      }
      if (msg.includes("Coupon usage limit exceeded") || rpcError?.code === "P0003") {
        throw new CouponError("Coupon usage limit reached");
      }
      if (msg.includes("already used by this user") || rpcError?.code === "P0004") {
        throw new CouponError("You have already used this coupon");
      }
      throw new Error(msg || "Failed to create order");
    }

    // ── Convert the specific cart used at checkout ───────────────────────────
    // Prefer the explicit cartId sent by the client. If not provided, fall back
    // to the most recently updated active cart (legacy behaviour).
    let cartToConvertId: string | null = cartId ?? null;
    if (!cartToConvertId) {
      const { data: fallbackCart } = await db
        .from("carts")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      cartToConvertId = fallbackCart?.id ?? null;
    }

    if (cartToConvertId) {
      const [, cartUpdateResult] = await Promise.all([
        db.from("cart_items").delete().eq("cart_id", cartToConvertId),
        db.from("carts")
          .update({ status: "converted", converted_to_order_id: orderId as string })
          .eq("id", cartToConvertId)
          .eq("status", "active"),  // only convert if still active (race guard)
      ]);
      if (cartUpdateResult.error) {
        console.error("[orders/create] cart conversion failed:", cartUpdateResult.error.message);
      }
    }

    // ── Create payment record ─────────────────────────────────────────────────
    const { data: payment } = await db
      .from("payments")
      .insert({
        order_id: orderId as string,
        provider: paymentProvider,
        status: "pending",
        amount: pricing.total,
        currency: CURRENCY,
      })
      .select()
      .single();

    // ── COD: confirm order, keep payment pending collection ──────────────────
    // Payment is NOT marked succeeded here. Cash has not been collected yet.
    // Admin must explicitly confirm cash collection via:
    //   POST /api/admin/orders/:id/cod-collect
    if (paymentProvider === "cod") {
      await Promise.all([
        db.rpc("update_order_status", {
          p_order_id: orderId as string,
          p_new_status: "confirmed",
          p_changed_by: user.id,
          p_reason: "Cash on delivery order confirmed — awaiting cash collection at delivery",
          p_source: "customer_action",
        }),
        // Mark payment as cod_pending_collection (not succeeded — cash not yet collected)
        db.from("payments")
          .update({ status: "cod_pending_collection" })
          .eq("id", payment!.id),
        // Write order event for observability / admin timeline
        db.from("order_events").insert({
          order_id:    orderId as string,
          event_type:  "order_confirmed",
          actor_id:    user.id,
          actor_type:  "customer",
          description: "COD order placed and confirmed — awaiting cash collection at delivery",
          metadata:    { payment_method: "cod", total: pricing.total },
          source:      "customer_action",
        }),
      ]);

      // ── Fire-and-forget confirmation email ─────────────────────────────────
      void (async () => {
        try {
          const [orderRow, profileRow] = await Promise.all([
            db
              .from("orders")
              .select("order_number, shipping_address, subtotal, discount, tax, shipping, total")
              .eq("id", orderId as string)
              .single(),
            db
              .from("profiles")
              .select("full_name, email")
              .eq("id", user.id)
              .maybeSingle(),
          ]);

          const addr = (orderRow.data?.shipping_address ?? {}) as Record<string, string>;
          await sendOrderConfirmationEmail({
            to: profileRow.data?.email ?? user.email ?? "",
            customerName: profileRow.data?.full_name ?? user.email ?? "Customer",
            orderId: orderId as string,
            order: {
              order_number: orderRow.data?.order_number ?? "",
              created_at: new Date().toISOString(),
              items: lineItems.map((li) => ({
                product_name: li.productName,
                quantity: li.quantity,
                unit_price: li.unitPrice,
              })),
              subtotal: orderRow.data?.subtotal ?? pricing.subtotal,
              discount: orderRow.data?.discount ?? pricing.discount,
              tax: orderRow.data?.tax ?? pricing.tax,
              shipping: orderRow.data?.shipping ?? pricing.shipping,
              total: orderRow.data?.total ?? pricing.total,
              currency_code: CURRENCY,
              payment_provider: "cod",
              shipping_address: {
                full_name: addr.full_name ?? addr.first_name ?? "",
                address_line1: addr.address_line1 ?? addr.line1 ?? "",
                address_line2: addr.address_line2 ?? addr.line2 ?? null,
                city: addr.city ?? "",
                state: addr.state ?? null,
                postal_code: addr.postal_code ?? addr.zip ?? null,
                country: addr.country ?? "",
              },
            },
          });
        } catch (emailErr) {
          console.error("[orders/create] confirmation email failed:", emailErr);
        }
      })();

      const responseBody = { orderId };
      await storeIdempotencyResult(db, idempotencyKey, responseBody);
      return apiSuccess(responseBody);
    }

    // ── Online payment: create payment intent + log order event ──────────────
    const provider = getPaymentProvider(paymentProvider);
    const [intent] = await Promise.all([
      provider.createIntent({
        orderId: orderId as string,
        amount: pricing.total,
        currency: CURRENCY,
        metadata: { order_id: orderId as string },
      }),
      db.from("order_events").insert({
        order_id:    orderId as string,
        event_type:  "order_created",
        actor_id:    user.id,
        actor_type:  "customer",
        description: `Order placed via ${paymentProvider} — payment intent pending`,
        metadata:    { payment_method: paymentProvider, total: pricing.total },
        source:      "customer_action",
      }),
    ]);

    await db
      .from("payments")
      .update({ provider_order_id: intent.providerOrderId })
      .eq("id", payment!.id);

    const responseBody = {
      orderId,
      clientSecret: intent.clientSecret,
      providerOrderId: intent.providerOrderId,
    };
    await storeIdempotencyResult(db, idempotencyKey, responseBody);
    end();
    return apiSuccess(responseBody);
  }),
  // 5 orders/min per IP — prevents order spam and payment intent abuse
  { limit: 5, windowMs: 60_000, routeKey: "orders:create" },
);

// ── Helper: store idempotency result ─────────────────────────────────────────
// Uses upsert with ignoreDuplicates so a concurrent request with the same key
// doesn't overwrite an already-stored result.
async function storeIdempotencyResult(
  db: ReturnType<typeof createServiceClient>,
  key: string | null,
  body: Record<string, unknown>,
): Promise<void> {
  if (!key) return;
  await db
    .from("idempotency_keys")
    .upsert(
      { key: `order:${key}`, response_body: body as unknown as import("@/types/database.types").Json },
      { onConflict: "key", ignoreDuplicates: true },
    );
}
