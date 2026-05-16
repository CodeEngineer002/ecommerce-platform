/**
 * High-level email helpers used by API route handlers.
 *
 * Each function is a thin wrapper that:
 *   1. Builds the React template
 *   2. Calls sendEmail() (fire-and-forget safe)
 *
 * Import ONLY from server-side files — this module imports "server-only" transitively.
 */
import * as React from "react";

import { sendEmail } from "./email-service";
import { OrderConfirmationEmail } from "./templates/order-confirmation";
import { OrderShippedEmail } from "./templates/order-shipped";
import { OrderCancelledEmail } from "./templates/order-cancelled";
import { RefundProcessedEmail } from "./templates/refund-processed";
import type { EmailOrderSummary } from "./templates/types";

const STORE_NAME = process.env.STORE_NAME ?? "ShopNest";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function orderUrl(orderId: string) {
  return `${APP_URL}/orders/${orderId}`;
}

// ── Order Confirmation ────────────────────────────────────────────────────────

export async function sendOrderConfirmationEmail(opts: {
  to: string;
  customerName: string;
  orderId: string;
  order: EmailOrderSummary;
}): Promise<void> {
  void sendEmail({
    to: opts.to,
    subject: `Order #${opts.order.order_number} confirmed — ${STORE_NAME}`,
    react: React.createElement(OrderConfirmationEmail, {
      customerName: opts.customerName,
      order: opts.order,
      orderUrl: orderUrl(opts.orderId),
      storeName: STORE_NAME,
    }),
  });
}

// ── Order Shipped ─────────────────────────────────────────────────────────────

export async function sendOrderShippedEmail(opts: {
  to: string;
  customerName: string;
  orderId: string;
  orderNumber: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  carrier?: string | null;
  estimatedDelivery?: string | null;
}): Promise<void> {
  void sendEmail({
    to: opts.to,
    subject: `Your order #${opts.orderNumber} has been shipped — ${STORE_NAME}`,
    react: React.createElement(OrderShippedEmail, {
      customerName: opts.customerName,
      orderNumber: opts.orderNumber,
      orderUrl: orderUrl(opts.orderId),
      trackingNumber: opts.trackingNumber,
      trackingUrl: opts.trackingUrl,
      carrier: opts.carrier,
      estimatedDelivery: opts.estimatedDelivery,
      storeName: STORE_NAME,
    }),
  });
}

// ── Order Cancelled ───────────────────────────────────────────────────────────

export async function sendOrderCancelledEmail(opts: {
  to: string;
  customerName: string;
  orderId: string;
  orderNumber: string;
  reason?: string | null;
  refundAmount?: number | null;
  currencyCode?: string;
}): Promise<void> {
  void sendEmail({
    to: opts.to,
    subject: `Your order #${opts.orderNumber} has been cancelled — ${STORE_NAME}`,
    react: React.createElement(OrderCancelledEmail, {
      customerName: opts.customerName,
      orderNumber: opts.orderNumber,
      orderUrl: orderUrl(opts.orderId),
      reason: opts.reason,
      refundAmount: opts.refundAmount,
      currencyCode: opts.currencyCode,
      storeName: STORE_NAME,
    }),
  });
}

// ── Refund Processed ──────────────────────────────────────────────────────────

export async function sendRefundProcessedEmail(opts: {
  to: string;
  customerName: string;
  orderId: string;
  orderNumber: string;
  refundAmount: number;
  currencyCode: string;
  refundType: string;
  reason?: string | null;
}): Promise<void> {
  void sendEmail({
    to: opts.to,
    subject: `Refund processed for order #${opts.orderNumber} — ${STORE_NAME}`,
    react: React.createElement(RefundProcessedEmail, {
      customerName: opts.customerName,
      orderNumber: opts.orderNumber,
      orderUrl: orderUrl(opts.orderId),
      refundAmount: opts.refundAmount,
      currencyCode: opts.currencyCode,
      refundType: opts.refundType,
      reason: opts.reason,
      storeName: STORE_NAME,
    }),
  });
}
