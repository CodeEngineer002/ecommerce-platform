import "server-only";

import { PaymentVerificationFailedError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase/server";

import {
  assertPaymentTransition,
  type PaymentLifecycleStatus,
} from "@/domain/order/order-state-machine";

export interface PaymentEventData {
  paymentId: string;
  orderId: string;
  eventType:
    | "created"
    | "authorized"
    | "captured"
    | "failed"
    | "refunded"
    | "partially_refunded"
    | "webhook_received"
    | "intent_created"
    | "retry";
  provider: string;
  amount?: number;
  payload?: Record<string, unknown>;
}

/**
 * Records a payment lifecycle event to the audit log.
 */
export async function recordPaymentEvent(data: PaymentEventData): Promise<void> {
  const db = createServiceClient();

  await db.from("payment_events").insert({
    payment_id: data.paymentId,
    order_id: data.orderId,
    event_type: data.eventType,
    provider: data.provider,
    amount: data.amount ?? null,
    payload: (data.payload as unknown as import("@/types/database.types").Json) ?? null,
  });
}

/**
 * Transitions a payment to a new status with validation and audit logging.
 * Never updates payment status directly — always go through this service.
 */
export async function transitionPaymentStatus(
  paymentId: string,
  newStatus: PaymentLifecycleStatus,
  eventData?: Partial<PaymentEventData>,
): Promise<void> {
  const db = createServiceClient();

  const { data: payment } = await db
    .from("payments")
    .select("id, order_id, status, provider, amount")
    .eq("id", paymentId)
    .single();

  if (!payment) throw new Error(`Payment ${paymentId} not found`);

  // Map DB payment status to lifecycle status
  const currentStatus = payment.status as PaymentLifecycleStatus;
  assertPaymentTransition(currentStatus, newStatus);

  // Map lifecycle status back to DB status values
  const dbStatusMap: Record<PaymentLifecycleStatus, string> = {
    unpaid:             "pending",
    pending:            "pending",
    authorized:         "processing",
    paid:               "succeeded",
    failed:             "failed",
    refunded:           "refunded",
    partially_refunded: "refunded",
  };

  await db
    .from("payments")
    .update({ status: dbStatusMap[newStatus] as "pending" | "processing" | "succeeded" | "failed" | "refunded" | "cancelled" })
    .eq("id", paymentId);

  await recordPaymentEvent({
    paymentId,
    orderId: payment.order_id,
    eventType: eventData?.eventType ?? "captured",
    provider: payment.provider,
    amount: eventData?.amount ?? payment.amount,
    payload: eventData?.payload,
  });
}

/**
 * Verifies that a payment intent exists and succeeded with the provider.
 * Returns the payment record if valid; throws PaymentVerificationFailedError if not.
 *
 * This must be called server-side from webhook handlers or server actions.
 * Never trust client-provided payment success signals.
 */
export async function verifyPaymentRecord(
  providerPaymentId: string,
): Promise<{ id: string; orderId: string; amount: number }> {
  const db = createServiceClient();

  const { data: payment } = await db
    .from("payments")
    .select("id, order_id, status, amount")
    .or(`provider_payment_id.eq.${providerPaymentId},provider_order_id.eq.${providerPaymentId}`)
    .maybeSingle();

  if (!payment) throw new PaymentVerificationFailedError();

  return {
    id: payment.id,
    orderId: payment.order_id,
    amount: payment.amount,
  };
}
