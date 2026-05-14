import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import { serverEnv } from "@/lib/env.server";
import { createServiceClient } from "@/lib/supabase/server";

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
  let responseBody: { received: boolean; [k: string]: unknown } = { received: true };

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
      }),
    ]);
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
      }),
    ]);
  }

  // ── Persist idempotency key so retries return the same response ───────────
  await db
    .from("idempotency_keys")
    .upsert(
      { key: idempotencyKey, response_body: responseBody as unknown as import("@/types/database.types").Json },
      { onConflict: "key", ignoreDuplicates: true },
    );

  return NextResponse.json(responseBody);
}
