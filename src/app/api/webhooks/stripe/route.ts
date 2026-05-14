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

  // Instantiate inside the handler — module-level init runs at build time
  // when env vars may not be present.
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

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const orderId = intent.metadata.order_id;

    await Promise.all([
      db
        .from("payments")
        .update({ status: "succeeded" as const, provider_payment_id: intent.id })
        .eq("provider_order_id", intent.id),
      db.from("orders").update({ status: "confirmed" as const }).eq("id", orderId),
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
      db.from("orders").update({ status: "cancelled" as const }).eq("id", orderId),
    ]);
  }

  return NextResponse.json({ received: true });
}
