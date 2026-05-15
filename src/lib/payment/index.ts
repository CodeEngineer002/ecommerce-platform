import type { PaymentProvider } from "@/types";

import { StripeProvider } from "./stripe-provider";
import type { IPaymentProvider } from "./types";

export function getPaymentProvider(provider?: PaymentProvider): IPaymentProvider {
  const active =
    provider ??
    (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER as PaymentProvider) ??
    "stripe";

  switch (active) {
    case "razorpay":
      // Razorpay is disabled until the webhook handler is implemented.
      // Without a webhook, payment confirmations are never received and orders
      // remain stuck in pending_payment indefinitely.
      throw new Error(
        "Razorpay payments are temporarily unavailable. Please use Stripe or Cash on Delivery.",
      );
    case "stripe":
    default:
      return new StripeProvider();
  }
}

export type {
  IPaymentProvider,
  CreatePaymentIntentParams,
  PaymentIntentResult,
  VerifyPaymentParams,
} from "./types";
