import { z } from "zod";

import { withApiHandler, apiSuccess, apiError } from "@/lib/api";
import { FREE_SHIPPING_THRESHOLD, SHIPPING_COST, TAX_RATE, CURRENCY } from "@/lib/constants";
import { AuthError, InventoryError, NotFoundError } from "@/lib/errors";
import { getPaymentProvider } from "@/lib/payment";
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

// ── Query result types (explicit to avoid `as` casts) ────────────────────────
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

function resolveInventory(inventory: InventoryRow | InventoryRow[] | null): InventoryRow | null {
  if (!inventory) return null;
  return Array.isArray(inventory) ? (inventory[0] ?? null) : inventory;
}

function getVariantPrice(variant: VariantRow): number {
  const product = resolveProduct(variant.product);
  return variant.price ?? product?.base_price ?? 0;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export const POST = withApiHandler(async (request: Request) => {
  // Authenticate via cookie-based session client
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) throw new AuthError();

  // Parse and validate the request body
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

  // All privileged DB operations use the service client (bypasses RLS)
  const db = createServiceClient();

  // ── Fetch authoritative prices — never trust client-submitted prices ──────
  const variantIds = cartItems.map((i) => i.variant_id);
  const { data: variantsRaw, error: variantError } = await db
    .from("product_variants")
    .select("id, price, is_active, product:products(id, name, base_price), inventory(quantity, reserved)")
    .in("id", variantIds);

  if (variantError || !variantsRaw) {
    throw new Error("Failed to fetch product variants");
  }

  const variants = variantsRaw as VariantRow[];

  // ── Validate availability ─────────────────────────────────────────────────
  for (const item of cartItems) {
    const variant = variants.find((v) => v.id === item.variant_id);
    if (!variant || !variant.is_active) {
      throw new NotFoundError(`Product variant ${item.variant_id} is unavailable`);
    }
    const inv = resolveInventory(variant.inventory);
    const available = (inv?.quantity ?? 0) - (inv?.reserved ?? 0);
    if (available < item.quantity) {
      throw new InventoryError("Insufficient stock for one or more items");
    }
  }

  // ── Calculate totals server-side ─────────────────────────────────────────
  const subtotal = cartItems.reduce((sum, item) => {
    const variant = variants.find((v) => v.id === item.variant_id)!;
    return sum + getVariantPrice(variant) * item.quantity;
  }, 0);

  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  let discount = 0;
  let couponId: string | null = null;

  // ── Validate and apply coupon ────────────────────────────────────────────
  if (couponCode) {
    const { data: coupon } = await db
      .from("coupons")
      .select("id, type, value, min_order_value, max_discount, usage_limit, used_count, valid_until")
      .eq("code", couponCode.toUpperCase())
      .eq("is_active", true)
      .single();

    if (coupon) {
      const notExpired = !coupon.valid_until || new Date(coupon.valid_until) >= new Date();
      const underLimit = !coupon.usage_limit || coupon.used_count < coupon.usage_limit;
      const meetsMinimum = !coupon.min_order_value || subtotal >= coupon.min_order_value;

      if (notExpired && underLimit && meetsMinimum) {
        discount =
          coupon.type === "percentage"
            ? Math.round((subtotal * coupon.value) / 100)
            : coupon.value;
        if (coupon.max_discount) discount = Math.min(discount, coupon.max_discount);
        couponId = coupon.id;
      }
    }
  }

  const total = subtotal + tax + shipping - discount;

  // ── Generate order number ─────────────────────────────────────────────────
  const { data: orderNumberData } = await db.rpc("generate_order_number");
  const orderNumber = String(orderNumberData ?? `ORD-${Date.now()}`);

  // ── Create order ──────────────────────────────────────────────────────────
  const { data: order, error: orderError } = await db
    .from("orders")
    .insert({
      order_number: orderNumber,
      user_id: user.id,
      status: "pending",
      subtotal,
      tax,
      shipping,
      discount,
      total,
      coupon_id: couponId,
      shipping_address: shippingAddress,
      billing_address: billingAddress ?? shippingAddress,
      notes,
    })
    .select()
    .single();

  if (orderError || !order) {
    throw new Error(orderError?.message ?? "Failed to create order");
  }

  // ── Insert order items ─────────────────────────────────────────────────────
  const orderItems = cartItems.map((item) => {
    const variant = variants.find((v) => v.id === item.variant_id)!;
    const product = resolveProduct(variant.product);
    const unitPrice = getVariantPrice(variant);
    return {
      order_id: order.id,
      variant_id: item.variant_id,
      product_name: product?.name ?? "Unknown",
      sku: null,
      quantity: item.quantity,
      unit_price: unitPrice,
      total: unitPrice * item.quantity,
      snapshot: {
        variant_id: item.variant_id,
        product_id: product?.id,
        price_at_purchase: unitPrice,
      },
    };
  });

  await db.from("order_items").insert(orderItems);

  // ── Reserve inventory — roll back order on failure ────────────────────────
  for (const item of cartItems) {
    const { error: reserveError } = await db.rpc("reserve_inventory", {
      p_variant_id: item.variant_id,
      p_quantity: item.quantity,
    });
    if (reserveError) {
      await db.from("orders").delete().eq("id", order.id);
      throw new InventoryError("Insufficient stock. Please refresh your cart and try again.");
    }
  }

  // ── Increment coupon usage ────────────────────────────────────────────────
  if (couponId) {
    await db.rpc("increment_coupon_usage", { p_coupon_id: couponId });
  }

  // ── Create payment record ─────────────────────────────────────────────────
  const { data: payment } = await db
    .from("payments")
    .insert({
      order_id: order.id,
      provider: paymentProvider,
      status: "pending",
      amount: total,
      currency: CURRENCY,
    })
    .select()
    .single();

  // ── COD: confirm immediately ──────────────────────────────────────────────
  if (paymentProvider === "cod") {
    await Promise.all([
      db.from("orders").update({ status: "confirmed" }).eq("id", order.id),
      db.from("payments").update({ status: "succeeded" }).eq("id", payment!.id),
    ]);
    return apiSuccess({ orderId: order.id });
  }

  // ── Online payment: create payment intent ─────────────────────────────────
  const provider = getPaymentProvider(paymentProvider);
  const intent = await provider.createIntent({
    orderId: order.id,
    amount: total,
    currency: CURRENCY,
    metadata: { order_number: orderNumber },
  });

  await db
    .from("payments")
    .update({ provider_order_id: intent.providerOrderId })
    .eq("id", payment!.id);

  return apiSuccess({
    orderId: order.id,
    clientSecret: intent.clientSecret,
    providerOrderId: intent.providerOrderId,
  });
});
