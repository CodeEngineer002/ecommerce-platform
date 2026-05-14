import { z } from "zod";

import { CouponError, validateCoupon } from "@/domain/coupon/coupon-engine";
import { calculatePricing } from "@/domain/pricing/pricing-engine";
import type { LineItem } from "@/domain/pricing/types";
import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { CURRENCY } from "@/lib/constants";
import { AuthError, InventoryError, NotFoundError } from "@/lib/errors";
import { getPaymentProvider } from "@/lib/payment";
import { withRateLimit } from "@/lib/rate-limit";
import { createClient, createServiceClient } from "@/lib/supabase/server";
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
  paymentProvider: z.enum(["stripe", "razorpay", "cod"]),
  notes: z.string().max(500).optional(),
});

// ── Query result types ────────────────────────────────────────────────────────
type ProductRow = { id: string; name: string; base_price: number };
type InventoryRow = { quantity: number; reserved: number };
type VariantRow = {
  id: string;
  price: number | null;
  is_active: boolean;
  product: ProductRow | ProductRow[] | null;
  inventory: InventoryRow | InventoryRow[] | null;
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
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) throw new AuthError();

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

  const { cartItems, shippingAddress, billingAddress, couponCode, paymentProvider, notes } =
    parsed.data;

  const db = createServiceClient();

  // ── Fetch authoritative prices — never trust client-submitted prices ──────
  const variantIds = cartItems.map((i) => i.variant_id);
  const { data: variantsRaw, error: variantError } = await db
    .from("product_variants")
    .select("id, price, is_active, product:products(id, name, base_price), inventory(quantity, reserved)")
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

  // ── Calculate pricing server-side ────────────────────────────────────────
  const pricing = calculatePricing(lineItems, couponData);

  // ── Build cart items payload for atomic RPC ───────────────────────────────
  const atomicCartItems = cartItems.map((item) => {
    const variant = variants.find((v) => v.id === item.variant_id)!;
    const product = resolveProduct(variant.product);
    const unitPrice = getVariantPrice(variant);
    return {
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_price: unitPrice,
      product_name: product?.name ?? "Unknown",
      sku: null,
      snapshot: {
        variant_id: item.variant_id,
        product_id: product?.id ?? null,
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
    p_coupon_id: couponData?.id ?? "",
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

  // ── COD: confirm immediately ──────────────────────────────────────────────
  if (paymentProvider === "cod") {
    await Promise.all([
      db.rpc("update_order_status", {
        p_order_id: orderId as string,
        p_new_status: "confirmed",
        p_changed_by: user.id,
        p_reason: "Cash on delivery order auto-confirmed",
      }),
      db.from("payments").update({ status: "succeeded" }).eq("id", payment!.id),
    ]);
    return apiSuccess({ orderId });
  }

  // ── Online payment: create payment intent ─────────────────────────────────
  const provider = getPaymentProvider(paymentProvider);
  const intent = await provider.createIntent({
    orderId: orderId as string,
    amount: pricing.total,
    currency: CURRENCY,
    metadata: { order_id: orderId as string },
  });

  await db
    .from("payments")
    .update({ provider_order_id: intent.providerOrderId })
    .eq("id", payment!.id);

  return apiSuccess({
    orderId,
    clientSecret: intent.clientSecret,
    providerOrderId: intent.providerOrderId,
  });
  }),
  // 5 orders/min per IP — prevents order spam and payment intent abuse
  { limit: 5, windowMs: 60_000, routeKey: "orders:create" },
);
