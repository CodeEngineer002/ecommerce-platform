import { NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { FREE_SHIPPING_THRESHOLD, SHIPPING_COST, TAX_RATE, CURRENCY } from "@/lib/constants";
import { getPaymentProvider } from "@/lib/payment";
import { addressSchema } from "@/lib/validators";

const orderRequestSchema = z.object({
  cartItems: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(10),
      })
    )
    .min(1, "Cart is empty"),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  couponCode: z.string().optional(),
  paymentProvider: z.enum(["stripe", "razorpay", "cod"]),
  notes: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = orderRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid request", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { cartItems, shippingAddress, billingAddress, couponCode, paymentProvider, notes } =
      parsed.data;

    // ── Look up authoritative prices from DB (never trust client) ──────────
    const variantIds = cartItems.map((i) => i.variant_id);
    const { data: variants, error: variantError } = await supabase
      .from("product_variants")
      .select("id, price, is_active, product:products(base_price), inventory(quantity, reserved)")
      .in("id", variantIds);

    if (variantError || !variants) {
      throw new Error("Failed to fetch product variants");
    }

    // Verify all requested variants exist and are active
    for (const item of cartItems) {
      const variant = variants.find((v) => v.id === item.variant_id);
      if (!variant || !variant.is_active) {
        return NextResponse.json(
          { message: `Product variant ${item.variant_id} is unavailable` },
          { status: 400 }
        );
      }

      const inv = Array.isArray(variant.inventory) ? variant.inventory[0] : variant.inventory;
      const available = (inv?.quantity ?? 0) - (inv?.reserved ?? 0);
      if (available < item.quantity) {
        return NextResponse.json(
          { message: "Insufficient stock for one or more items" },
          { status: 409 }
        );
      }
    }

    // ── Calculate totals using server-side prices ────────────────────────────
    const subtotal = cartItems.reduce((sum, item) => {
      const variant = variants.find((v) => v.id === item.variant_id)!;
      const product = Array.isArray(variant.product) ? variant.product[0] : variant.product;
      const price = variant.price ?? (product as { base_price: number }).base_price;
      return sum + price * item.quantity;
    }, 0);

    const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
    const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
    let discount = 0;
    let couponId: string | null = null;

    if (couponCode) {
      const { data: coupon } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", couponCode.toUpperCase())
        .eq("is_active", true)
        .single();

      if (coupon) {
        if (!coupon.valid_until || new Date(coupon.valid_until) >= new Date()) {
          if (!coupon.usage_limit || coupon.used_count < coupon.usage_limit) {
            if (!coupon.min_order_value || subtotal >= coupon.min_order_value) {
              discount =
                coupon.type === "percentage"
                  ? Math.round((subtotal * coupon.value) / 100)
                  : coupon.value;
              if (coupon.max_discount) discount = Math.min(discount, coupon.max_discount);
              couponId = coupon.id;
            }
          }
        }
      }
    }

    const total = subtotal + tax + shipping - discount;

    // ── Generate order number ──────────────────────────────────────────────
    const { data: orderNumberData } = await supabase.rpc("generate_order_number");
    const orderNumber = (orderNumberData ?? `ORD-${Date.now()}`) as string;

    // ── Create order ───────────────────────────────────────────────────────
    const { data: order, error: orderError } = await supabase
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

    // ── Insert order items ─────────────────────────────────────────────────
    const orderItems = cartItems.map((item) => {
      const variant = variants.find((v) => v.id === item.variant_id)!;
      const product = Array.isArray(variant.product) ? variant.product[0] : variant.product;
      const unitPrice = variant.price ?? (product as { base_price: number }).base_price;
      return {
        order_id: order.id,
        variant_id: item.variant_id,
        product_name: (product as { name?: string })?.name ?? "Unknown",
        sku: null,
        quantity: item.quantity,
        unit_price: unitPrice,
        total: unitPrice * item.quantity,
        snapshot: { variant_id: item.variant_id },
      };
    });

    await supabase.from("order_items").insert(orderItems);

    // ── Reserve inventory (check success for each) ─────────────────────────
    for (const item of cartItems) {
      const { error: reserveError } = await supabase.rpc("reserve_inventory", {
        p_variant_id: item.variant_id,
        p_quantity: item.quantity,
      });
      if (reserveError) {
        // Roll back: delete the order (cascade deletes items)
        await supabase.from("orders").delete().eq("id", order.id);
        return NextResponse.json(
          { message: "Failed to reserve inventory. Please try again." },
          { status: 409 }
        );
      }
    }

    // ── Increment coupon usage ─────────────────────────────────────────────
    if (couponId) {
      await supabase.rpc("increment_coupon_usage", { p_coupon_id: couponId });
    }

    // ── Create payment record ─────────────────────────────────────────────
    const { data: payment } = await supabase
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

    // ── COD: confirm immediately ───────────────────────────────────────────
    if (paymentProvider === "cod") {
      await Promise.all([
        supabase.from("orders").update({ status: "confirmed" }).eq("id", order.id),
        supabase.from("payments").update({ status: "succeeded" }).eq("id", payment!.id),
      ]);
      return NextResponse.json({ orderId: order.id });
    }

    // ── Online payment: create intent ─────────────────────────────────────
    const provider = getPaymentProvider(paymentProvider);
    const intent = await provider.createIntent({
      orderId: order.id,
      amount: total,
      currency: CURRENCY,
      metadata: { order_number: orderNumber },
    });

    await supabase
      .from("payments")
      .update({ provider_order_id: intent.providerOrderId })
      .eq("id", payment!.id);

    return NextResponse.json({
      orderId: order.id,
      clientSecret: intent.clientSecret,
      providerOrderId: intent.providerOrderId,
    });
  } catch (error) {
    console.error("Order creation error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
