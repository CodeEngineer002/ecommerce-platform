import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import { createServiceClient } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

export async function POST(request: Request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ message: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ message: "Webhook signature invalid" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const orderId = intent.metadata.order_id;

    await supabase
      .from("payments")
      .update({ status: "succeeded" as const, provider_payment_id: intent.id })
      .eq("provider_order_id", intent.id);

    await supabase
      .from("orders")
      .update({ status: "confirmed" as const })
      .eq("id", orderId);
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const orderId = intent.metadata.order_id;

    await supabase
      .from("payments")
      .update({ status: "failed" as const })
      .eq("provider_order_id", intent.id);

    await supabase
      .from("orders")
      .update({ status: "cancelled" as const })
      .eq("id", orderId);
  }

  return NextResponse.json({ received: true });
}
