import type { PaymentProvider } from "@/types";

import { RazorpayProvider } from "./razorpay-provider";
import { StripeProvider } from "./stripe-provider";
import type { IPaymentProvider } from "./types";

export function getPaymentProvider(provider?: PaymentProvider): IPaymentProvider {
  const active =
    provider ??
    (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER as PaymentProvider) ??
    "stripe";

  switch (active) {
    case "razorpay":
      return new RazorpayProvider();
    case "stripe":
    default:
      return new StripeProvider();
  }
}

export type { IPaymentProvider, CreatePaymentIntentParams, PaymentIntentResult, VerifyPaymentParams } from "./types";
