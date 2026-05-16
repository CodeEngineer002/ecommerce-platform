import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import { serverEnv } from "@/lib/env.server";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";

export async function POST(request: Request) {
  if (!serverEnv.STRIPE_SECRET_KEY || !serverEnv.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ message: "Stripe not configured" }, { status: 501 });
  }

  const stripe = new Stripe(serverEnv.STRIPE_SECRET_KEY, {
    apiVersion: "2025-02-24.acacia",
  });

  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ message: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, serverEnv.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ message: "Webhook signature invalid" }, { status: 400 });
  }

  const db = createServiceClient();

  // ── Idempotency check — deduplicate retried webhook deliveries ────────────
  const idempotencyKey = event.id;
  const { data: existing } = await db
    .from("idempotency_keys")
    .select("response_body")
    .eq("key", idempotencyKey)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(existing.response_body ?? { received: true });
  }

  // ── Process event ─────────────────────────────────────────────────────────
  const responseBody: { received: boolean; [k: string]: unknown } = { received: true };

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const orderId = intent.metadata.order_id;

    await Promise.all([
      db
        .from("payments")
        .update({ status: "succeeded" as const, provider_payment_id: intent.id })
        .eq("provider_order_id", intent.id),
      db.rpc("update_order_status", {
        p_order_id: orderId,
        p_new_status: "confirmed",
        p_changed_by: null,
        p_reason: "Payment confirmed via Stripe webhook",
        p_source: "payment_webhook",
      }),
    ]);

    // ── Fire-and-forget confirmation email ─────────────────────────────────
    void (async () => {
      try {
        const { data: order } = await db
          .from("orders")
          .select(
            "order_number, user_id, shipping_address, subtotal, discount, tax, shipping, total",
          )
          .eq("id", orderId)
          .single();

        if (!order?.user_id) return;

        const [itemsResult, profileResult] = await Promise.all([
          db
            .from("order_items")
            .select("product_name, quantity, unit_price")
            .eq("order_id", orderId),
          db.from("profiles").select("full_name, email").eq("id", order.user_id).maybeSingle(),
        ]);

        const addr = (order.shipping_address ?? {}) as Record<string, string>;
        const toEmail = profileResult.data?.email ?? "";
        if (!toEmail) return;

        await sendOrderConfirmationEmail({
          to: toEmail,
          customerName: profileResult.data?.full_name ?? toEmail,
          orderId,
          order: {
            order_number: order.order_number,
            created_at: new Date().toISOString(),
            items: (itemsResult.data ?? []).map((i) => ({
              product_name: i.product_name,
              quantity: i.quantity,
              unit_price: i.unit_price,
            })),
            subtotal: order.subtotal,
            discount: order.discount,
            tax: order.tax,
            shipping: order.shipping,
            total: order.total,
            currency_code: intent.currency.toUpperCase(),
            payment_provider: "stripe",
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
        console.error("[stripe/webhook] confirmation email failed:", emailErr);
      }
    })();
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const orderId = intent.metadata.order_id;

    await Promise.all([
      db
        .from("payments")
        .update({ status: "failed" as const })
        .eq("provider_order_id", intent.id),
      db.rpc("update_order_status", {
        p_order_id: orderId,
        p_new_status: "cancelled",
        p_changed_by: null,
        p_reason: "Payment failed via Stripe webhook",
        p_source: "payment_webhook",
      }),
    ]);
  }

  // ── Persist idempotency key so retries return the same response ───────────
  await db
    .from("idempotency_keys")
    .upsert(
      { key: idempotencyKey, response_body: responseBody as unknown as Json },
      { onConflict: "key", ignoreDuplicates: true },
    );

  return NextResponse.json(responseBody);
}
