import "server-only";
import Stripe from "stripe";

import { serverEnv } from "@/lib/env.server";

import type {
  CreatePaymentIntentParams,
  IPaymentProvider,
  PaymentIntentResult,
  VerifyPaymentParams,
} from "./types";

export class StripeProvider implements IPaymentProvider {
  readonly provider = "stripe" as const;
  private stripe: Stripe;

  constructor() {
    if (!serverEnv.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured");
    this.stripe = new Stripe(serverEnv.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
    });
  }

  async createIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    const intent = await this.stripe.paymentIntents.create({
      amount: Math.round(params.amount * 100), // paise → smallest unit
      currency: params.currency.toLowerCase(),
      metadata: {
        order_id: params.orderId,
        ...params.metadata,
      },
      automatic_payment_methods: { enabled: true },
    });

    return {
      clientSecret: intent.client_secret!,
      providerOrderId: intent.id,
      amount: params.amount,
      currency: params.currency,
    };
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<boolean> {
    const intent = await this.stripe.paymentIntents.retrieve(params.providerPaymentId);
    return intent.status === "succeeded";
  }

  async refund(paymentId: string, amount?: number): Promise<boolean> {
    const refund = await this.stripe.refunds.create({
      payment_intent: paymentId,
      ...(amount && { amount: Math.round(amount * 100) }),
    });
    return refund.status === "succeeded";
  }
}
