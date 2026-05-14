import type { PaymentProvider } from "@/types";

export interface CreatePaymentIntentParams {
  orderId: string;
  amount: number;
  currency: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResult {
  clientSecret?: string;
  orderId?: string;
  providerOrderId?: string;
  amount: number;
  currency: string;
}

export interface VerifyPaymentParams {
  orderId: string;
  providerPaymentId: string;
  providerOrderId?: string;
  signature?: string;
}

export interface IPaymentProvider {
  provider: PaymentProvider;
  createIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult>;
  verifyPayment(params: VerifyPaymentParams): Promise<boolean>;
  refund(paymentId: string, amount?: number): Promise<boolean>;
}
