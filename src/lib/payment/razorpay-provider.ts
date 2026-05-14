import "server-only";
import crypto from "crypto";

import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

import type {
  CreatePaymentIntentParams,
  IPaymentProvider,
  PaymentIntentResult,
  VerifyPaymentParams,
} from "./types";

export class RazorpayProvider implements IPaymentProvider {
  readonly provider = "razorpay" as const;
  private keyId: string;
  private keySecret: string;

  constructor() {
    if (!env.NEXT_PUBLIC_RAZORPAY_KEY_ID)
      throw new Error("NEXT_PUBLIC_RAZORPAY_KEY_ID is not configured");
    if (!serverEnv.RAZORPAY_KEY_SECRET) throw new Error("RAZORPAY_KEY_SECRET is not configured");
    this.keyId = env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    this.keySecret = serverEnv.RAZORPAY_KEY_SECRET;
  }

  private async request<T>(path: string, method: string, body?: unknown): Promise<T> {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`Razorpay API error: ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async createIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    const order = await this.request<{ id: string; amount: number; currency: string }>(
      "/orders",
      "POST",
      {
        amount: Math.round(params.amount * 100),
        currency: params.currency.toUpperCase(),
        notes: { order_id: params.orderId, ...params.metadata },
      }
    );

    return {
      providerOrderId: order.id,
      amount: params.amount,
      currency: params.currency,
    };
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<boolean> {
    const body = `${params.providerOrderId}|${params.providerPaymentId}`;
    const expectedSignature = crypto
      .createHmac("sha256", this.keySecret)
      .update(body)
      .digest("hex");
    return expectedSignature === params.signature;
  }

  async refund(paymentId: string, amount?: number): Promise<boolean> {
    const result = await this.request<{ id: string }>(
      `/payments/${paymentId}/refund`,
      "POST",
      amount ? { amount: Math.round(amount * 100) } : {}
    );
    return !!result.id;
  }
}
