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
import { OrderDeliveredEmail } from "./templates/order-delivered";
import { OrderOutForDeliveryEmail } from "./templates/order-out-for-delivery";
import { OrderCancelledEmail } from "./templates/order-cancelled";
import { OrderRefusedEmail } from "./templates/order-refused";
import { CodCollectedEmail } from "./templates/cod-collected";
import { RefundProcessedEmail } from "./templates/refund-processed";
import { ReturnApprovedEmail } from "./templates/return-approved";
import { ReturnRejectedEmail } from "./templates/return-rejected";
import { ReturnPickupUpdateEmail, type PickupStage } from "./templates/return-pickup-update";
import type { EmailOrderSummary } from "./templates/types";

const STORE_NAME = process.env.STORE_NAME ?? "ShopNest";
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Default locale used in email CTAs. The middleware would redirect /orders/...
// to the locale path anyway, but using a direct locale link avoids the extra
// round-trip and ensures the user lands on the right regional store.
const DEFAULT_EMAIL_COUNTRY = process.env.NEXT_PUBLIC_DEFAULT_COUNTRY ?? "in";
const DEFAULT_EMAIL_LANG    = process.env.NEXT_PUBLIC_DEFAULT_LANG    ?? "en";

function orderUrl(orderId: string, country = DEFAULT_EMAIL_COUNTRY, lang = DEFAULT_EMAIL_LANG) {
  return `${APP_URL}/${country}/${lang}/orders/${orderId}`;
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

// ── Order Out for Delivery ────────────────────────────────────────────────────

export async function sendOrderOutForDeliveryEmail(opts: {
  to:              string;
  customerName:    string;
  orderId:         string;
  orderNumber:     string;
  trackingNumber?: string | null;
  trackingUrl?:    string | null;
  carrier?:        string | null;
}): Promise<void> {
  void sendEmail({
    to:      opts.to,
    subject: `Your order #${opts.orderNumber} is out for delivery today — ${STORE_NAME}`,
    react:   React.createElement(OrderOutForDeliveryEmail, {
      customerName:   opts.customerName,
      orderNumber:    opts.orderNumber,
      orderUrl:       orderUrl(opts.orderId),
      trackingNumber: opts.trackingNumber,
      trackingUrl:    opts.trackingUrl,
      carrier:        opts.carrier,
      storeName:      STORE_NAME,
    }),
  });
}

// ── Order Delivered ───────────────────────────────────────────────────────────

export async function sendOrderDeliveredEmail(opts: {
  to:           string;
  customerName: string;
  orderId:      string;
  orderNumber:  string;
  deliveredAt?: string | null;
}): Promise<void> {
  void sendEmail({
    to:      opts.to,
    subject: `Your order #${opts.orderNumber} has been delivered — ${STORE_NAME}`,
    react:   React.createElement(OrderDeliveredEmail, {
      customerName: opts.customerName,
      orderNumber:  opts.orderNumber,
      orderUrl:     orderUrl(opts.orderId),
      deliveredAt:  opts.deliveredAt,
      storeName:    STORE_NAME,
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

// ── Order Delivery Refused (Phase 2.1) ────────────────────────────────────────

export async function sendOrderRefusedEmail(opts: {
  to: string;
  customerName: string;
  orderId: string;
  orderNumber: string;
  reason?: string | null;
}): Promise<void> {
  void sendEmail({
    to: opts.to,
    subject: `Update on order #${opts.orderNumber} — delivery refused — ${STORE_NAME}`,
    react: React.createElement(OrderRefusedEmail, {
      customerName: opts.customerName,
      orderNumber:  opts.orderNumber,
      orderUrl:     orderUrl(opts.orderId),
      reason:       opts.reason,
      storeName:    STORE_NAME,
    }),
  });
}

// ── COD Cash Collected (Phase 2.2) ────────────────────────────────────────────

export async function sendCodCollectedEmail(opts: {
  to: string;
  customerName: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  currencyCode?: string;
  collectedAt?: string | null;
}): Promise<void> {
  void sendEmail({
    to: opts.to,
    subject: `Payment received for order #${opts.orderNumber} — ${STORE_NAME}`,
    react: React.createElement(CodCollectedEmail, {
      customerName: opts.customerName,
      orderNumber:  opts.orderNumber,
      orderUrl:     orderUrl(opts.orderId),
      amount:       opts.amount,
      currencyCode: opts.currencyCode,
      collectedAt:  opts.collectedAt,
      storeName:    STORE_NAME,
    }),
  });
}

// ── Return Approved ───────────────────────────────────────────────────────────

export async function sendReturnApprovedEmail(opts: {
  to: string;
  customerName: string;
  orderId: string;
  orderNumber: string;
  requestType: "return" | "replacement";
  reviewNote?: string | null;
}): Promise<void> {
  void sendEmail({
    to: opts.to,
    subject: `Your ${opts.requestType} request for order #${opts.orderNumber} has been approved — ${STORE_NAME}`,
    react: React.createElement(ReturnApprovedEmail, {
      customerName: opts.customerName,
      orderNumber:  opts.orderNumber,
      orderUrl:     orderUrl(opts.orderId),
      requestType:  opts.requestType,
      reviewNote:   opts.reviewNote,
      storeName:    STORE_NAME,
    }),
  });
}

// ── Return Rejected ───────────────────────────────────────────────────────────

export async function sendReturnRejectedEmail(opts: {
  to: string;
  customerName: string;
  orderId: string;
  orderNumber: string;
  requestType: "return" | "replacement";
  reason?: string | null;
}): Promise<void> {
  void sendEmail({
    to: opts.to,
    subject: `Update on your ${opts.requestType} request for order #${opts.orderNumber} — ${STORE_NAME}`,
    react: React.createElement(ReturnRejectedEmail, {
      customerName: opts.customerName,
      orderNumber:  opts.orderNumber,
      orderUrl:     orderUrl(opts.orderId),
      requestType:  opts.requestType,
      reason:       opts.reason,
      storeName:    STORE_NAME,
    }),
  });
}

// ── Return Pickup Update ──────────────────────────────────────────────────────

export async function sendReturnPickupUpdateEmail(opts: {
  to: string;
  customerName: string;
  orderId: string;
  orderNumber: string;
  stage: PickupStage;
  requestType: "return" | "replacement";
}): Promise<void> {
  const stageLabels: Record<PickupStage, string> = {
    scheduled: "pickup scheduled",
    collected: "item collected",
    received:  "item received",
  };
  void sendEmail({
    to: opts.to,
    subject: `Order #${opts.orderNumber} — ${stageLabels[opts.stage]} — ${STORE_NAME}`,
    react: React.createElement(ReturnPickupUpdateEmail, {
      customerName: opts.customerName,
      orderNumber:  opts.orderNumber,
      orderUrl:     orderUrl(opts.orderId),
      stage:        opts.stage,
      requestType:  opts.requestType,
      storeName:    STORE_NAME,
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
