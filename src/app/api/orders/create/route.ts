import { z } from "zod";

import { CouponError, validateCoupon } from "@/domain/coupon/coupon-engine";
import { calculatePricing } from "@/domain/pricing/pricing-engine";
import type { LineItem } from "@/domain/pricing/types";
import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { CART_MAX_QUANTITY } from "@/lib/constants";
import {
  getCurrencyForCountry,
  isCodVerificationRequired,
  resolveServiceability,
} from "@/lib/i18n/region-config";
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
  // Max per-line matches CART_MAX_QUANTITY so the cart and order APIs are consistent.
  // Real stock enforcement happens inside create_order_atomic via SELECT FOR UPDATE.
  quantity: z.number().int().min(1).max(CART_MAX_QUANTITY),
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

    const {
      cartItems: clientCartItems,
      shippingAddress,
      billingAddress,
      couponCode,
      paymentProvider,
      notes,
      cartId,
    } = parsed.data;

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

    // ── Server-side cart loading + ownership verification ────────────────────
    // When cartId is provided we load items directly from the DB and verify
    // the cart belongs to the authenticated user. This prevents two classes of
    // attack:
    //   1. Using someone else's cartId to delete/convert their cart.
    //   2. Sending a valid cartId but manipulated cartItems (price/qty tamper).
    // When cartId is absent we fall back to client-submitted cartItems (guest
    // checkout path — no server cart to load from).
    let cartItems = clientCartItems;

    // MISSING-2 fix: also read coupon_code from the cart row so that coupons
    // applied via the cart page are automatically carried into the order even
    // if the customer never re-typed them in the checkout form.
    let cartCouponCode: string | null = null;

    if (cartId) {
      const { data: cartRow, error: cartFetchError } = await db
        .from("carts")
        .select("id, user_id, status, coupon_code")
        .eq("id", cartId)
        .maybeSingle();

      if (cartFetchError || !cartRow) {
        end();
        return apiError("Cart not found", 404, "CART_NOT_FOUND");
      }

      // Ownership check — reject if the cart belongs to a different user.
      if (cartRow.user_id !== user.id) {
        end();
        return apiError("You do not own this cart", 403, "CART_OWNERSHIP_ERROR");
      }

      // Status check — reject if the cart was already converted/expired/deleted.
      if (cartRow.status !== "active") {
        end();
        return apiError(
          `Cart is ${cartRow.status} and cannot be checked out`,
          409,
          "CART_NOT_ACTIVE",
        );
      }

      // Capture cart-level coupon before it is cleared on conversion.
      cartCouponCode = cartRow.coupon_code ?? null;

      // Load items from the server — never trust client-submitted cartItems when
      // we have an authoritative server cart.
      const { data: serverItems, error: itemsError } = await db
        .from("cart_items")
        .select("variant_id, quantity")
        .eq("cart_id", cartId);

      if (itemsError) {
        end();
        return apiError("Failed to load cart items", 500, "CART_ITEMS_ERROR");
      }

      if (!serverItems || serverItems.length === 0) {
        end();
        return apiError("Cart is empty", 400, "CART_EMPTY");
      }

      // Overwrite client-submitted items with server-authoritative ones.
      cartItems = serverItems.map((i) => ({
        variant_id: i.variant_id,
        quantity: i.quantity,
      }));
    }

    // ── Cap cart quantities to available stock (ARCH-4) ───────────────────────
    // buildCartSummary() computes effectiveQty client-side but never persists it.
    // Here we enforce the same cap server-side so create_order_atomic never
    // receives a quantity that would exceed available inventory, preventing a
    // confusing RPC failure downstream.
    {
      const capVariantIds = cartItems.map((i) => i.variant_id);
      const { data: stockRows } = await db
        .from("inventory_levels")
        .select("variant_id, quantity, reserved")
        .in("variant_id", capVariantIds);

      if (stockRows && stockRows.length > 0) {
        const availMap = new Map<string, number>(
          stockRows.map((r) => [r.variant_id, Math.max(0, r.quantity - r.reserved)]),
        );

        const capped = cartItems
          .map((item) => {
            const avail = availMap.get(item.variant_id);
            if (avail === undefined) return item; // no stock row → let RPC handle it
            return { ...item, quantity: Math.min(item.quantity, avail) };
          })
          .filter((item) => item.quantity > 0);

        if (capped.length === 0) {
          end();
          return apiError(
            "All items in your cart are currently out of stock.",
            409,
            "OUT_OF_STOCK",
          );
        }
        cartItems = capped;
      }
    }

    // ── Fetch authoritative prices — never trust client-submitted prices ──────
    // The hard per-row lock still happens inside create_order_atomic; the cap
    // above is an early-exit safety net, not a replacement for the RPC guard.
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

    // ── Resolve effective coupon code ────────────────────────────────────────
    // Priority: explicit form input > cart-applied coupon.
    // This ensures coupons applied via the cart page are never silently dropped
    // when the customer doesn't re-type them in the checkout form (MISSING-2).
    const effectiveCouponCode = couponCode?.trim().toUpperCase() || cartCouponCode?.trim().toUpperCase() || undefined;

    // ── Validate coupon (soft pre-flight — hard lock happens inside RPC) ──────
    let couponData = null;
    if (effectiveCouponCode) {
      const subtotal = lineItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      couponData = await validateCoupon(effectiveCouponCode, subtotal, user.id);
    }

    // ── Resolve country-specific tax + currency from shipping address ─────────
    const taxConfig    = getTaxConfig(shippingAddress.country);
    const currencyCode = getCurrencyForCountry(shippingAddress.country);

    // ── Gate: is this payment method enabled for the customer's country? ─────
    // Country-level admin toggle + COD cap (table country_payment_methods).
    // This is the SINGLE source of truth for both "is this method available"
    // and "what's the COD cap for this country" — supersedes the legacy
    // region-config codMaxAmount field.
    const { data: methodRow, error: methodErr } = await db
      .from("country_payment_methods")
      .select("is_enabled, cod_max_amount")
      .eq("country_code", shippingAddress.country.toUpperCase())
      .eq("method", paymentProvider)
      .maybeSingle();
    if (methodErr) {
      console.warn("[orders/create] payment-method lookup failed:", methodErr.message);
    } else if (!methodRow || !methodRow.is_enabled) {
      return apiError(
        `${paymentProvider === "cod" ? "Cash on Delivery" : "This payment method"} is not available for ${shippingAddress.country}. Please choose a different payment method.`,
        422,
        "PAYMENT_METHOD_DISABLED",
      );
    }
    const countryCodMaxAmount = methodRow?.cod_max_amount ?? null;

    // ── P0-2: pincode serviceability gate ────────────────────────────────────
    // Hierarchy:
    //   1. Raw table lookup (whether pincode is in serviceable_pincodes).
    //   2. resolveServiceability() applies the country's pincodeEnforcement
    //      policy — strict / permissive / off — so a missing pincode in a
    //      "permissive" country doesn't block legitimate orders while ops
    //      builds out the list.
    //
    // Reject before inventory reservation so we don't tie up stock for
    // orders we can't fulfil.
    {
      const { data: svcRows, error: svcErr } = await db.rpc("check_pincode_serviceability", {
        p_country: shippingAddress.country,
        p_pincode: shippingAddress.postal_code,
      });
      if (svcErr) {
        // Soft-fail on lookup outage — better a successful order than a missed
        // sale due to an infra hiccup. Policy enforcement still kicks in if
        // raw lookup never produced a row.
        console.warn("[orders/create] serviceability lookup failed:", svcErr.message);
      }
      const raw = Array.isArray(svcRows) ? svcRows[0] : svcRows;
      const svc = resolveServiceability(shippingAddress.country, raw ?? null);

      if (!svc.is_deliverable) {
        return apiError(
          `We don't deliver to ${shippingAddress.postal_code} yet. Please use a different shipping address.`,
          422,
          "PINCODE_NOT_SERVICEABLE",
          { pincode: [shippingAddress.postal_code] },
        );
      }
      if (paymentProvider === "cod" && !svc.cod_enabled) {
        return apiError(
          `Cash on Delivery is not available for ${shippingAddress.postal_code}. Please choose a prepaid payment method.`,
          422,
          "COD_NOT_AVAILABLE_FOR_PINCODE",
          { pincode: [shippingAddress.postal_code] },
        );
      }
    }

    // ── Calculate pricing server-side ────────────────────────────────────────
    const pricing = calculatePricing(lineItems, couponData, undefined, taxConfig);

    // ── Enforce per-country COD max amount ───────────────────────────────────
    // Cap is read from country_payment_methods.cod_max_amount (single source
    // of truth — see migration 00070). NULL = no cap. The DB trigger also
    // enforces this on payment INSERT as a second line of defence.
    if (paymentProvider === "cod"
        && countryCodMaxAmount !== null
        && pricing.total > countryCodMaxAmount) {
      return apiError(
        `Cash on Delivery is only available for orders up to ${countryCodMaxAmount} ${currencyCode}. Your total ${pricing.total} ${currencyCode} exceeds the limit — please choose a prepaid payment method.`,
        422,
        "COD_OVER_LIMIT",
        { maxAmount: [String(countryCodMaxAmount)] },
      );
    }

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
      p_coupon_code: effectiveCouponCode ?? "",
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
    // When cartId was provided it was already ownership-verified above; use it
    // directly. If not provided, fall back to the most recently updated active
    // cart owned by this user (legacy guest/no-cartId path).
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
        // Delete items only for this user's cart (user_id guard prevents touching
        // another user's cart items even if cartToConvertId was somehow wrong).
        db.from("cart_items").delete().eq("cart_id", cartToConvertId),
        db.from("carts")
          .update({ status: "converted", converted_to_order_id: orderId as string })
          .eq("id", cartToConvertId)
          .eq("user_id", user.id)       // ownership guard
          .eq("status", "active"),       // only convert if still active (race guard)
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
        currency: currencyCode,
      })
      .select()
      .single();

    // ── COD: confirm order, keep payment pending collection ──────────────────
    // Payment is NOT marked succeeded here. Cash has not been collected yet.
    // Admin must explicitly confirm cash collection via:
    //   POST /api/admin/orders/:id/cod-collect
    if (paymentProvider === "cod") {
      // P0-3: high-value COD orders need an admin verification call before
      // auto-queue moves them to processing. Low-value orders auto-pass.
      const needsVerification = isCodVerificationRequired(
        shippingAddress.country, pricing.total,
      );

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
        // P0-3: flag the order if verification is needed. auto_queue_confirmed_orders
        // skips orders where cod_verification_required=true AND cod_verified_at IS NULL.
        db.from("orders")
          .update({ cod_verification_required: needsVerification })
          .eq("id", orderId as string),
        // Write order event for observability / admin timeline
        db.from("order_events").insert({
          order_id:    orderId as string,
          event_type:  needsVerification ? "cod_verification_pending" : "order_confirmed",
          actor_id:    user.id,
          actor_type:  "customer",
          description: needsVerification
            ? `COD order placed — awaiting admin verification call (amount ${pricing.total} ${currencyCode})`
            : "COD order placed and confirmed — awaiting cash collection at delivery",
          metadata:    {
            payment_method: "cod",
            total: pricing.total,
            verification_required: needsVerification,
          },
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
              currency_code: currencyCode,
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
        currency: currencyCode,
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

    // BUG-4 fix: move Stripe order to `pending_payment` immediately.
    // `cancel_unpaid_orders` cancels `pending_payment` orders after 30 min,
    // but only cancels `pending` orders after 24 h. Without this transition,
    // an abandoned Stripe checkout would hold inventory for 24 h instead of 30 min.
    // State machine allows: pending → pending_payment (see migration 00038).
    // When payment succeeds the webhook moves pending_payment → confirmed.
    await db.rpc("update_order_status", {
      p_order_id:   orderId as string,
      p_new_status: "pending_payment",
      p_changed_by: user.id,
      p_reason:     "Stripe payment intent created — awaiting payment confirmation",
      p_source:     "customer_action",
    });

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
