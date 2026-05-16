/**
 * Order journey configuration for customer-facing UI.
 *
 * Maps every order status to:
 *   - display label + color
 *   - which "track" it belongs to (main / return / replacement / refund)
 *   - progress step index (0-based, for timeline)
 *   - contextual hint text shown to customer
 */

import type { OrderStatus } from "@/domain/order/order-state-machine";

export type OrderTrack = "active" | "cancelled" | "return" | "replacement" | "refund";

export interface OrderJourneyConfig {
  label:      string;
  color:      "green" | "blue" | "purple" | "yellow" | "red" | "gray" | "orange";
  track:      OrderTrack;
  step:       number;   // position in the track's progress steps
  hint:       string;   // short customer-facing description
  isTerminal: boolean;
}

// ── Active order track (0 → 8) ────────────────────────────────────────────────
const ACTIVE_STEPS = [
  "Order Placed",
  "Confirmed",
  "Processing",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Delivered",
] as const;

export const ACTIVE_ORDER_STEPS = ACTIVE_STEPS;

// ── Return track (0 → 5) ─────────────────────────────────────────────────────
export const RETURN_STEPS = [
  "Return Requested",
  "Approved",
  "Pickup Scheduled",
  "In Transit",
  "Received",
  "Refunded / Replaced",
] as const;

// ── Replacement track ─────────────────────────────────────────────────────────
export const REPLACEMENT_STEPS = [
  "Replacement Requested",
  "Approved",
  "Shipped",
  "Delivered",
] as const;

// ── Per-status config ─────────────────────────────────────────────────────────
export const ORDER_JOURNEY: Record<OrderStatus, OrderJourneyConfig> = {
  // Active track
  draft:                 { label: "Order Placed",        color: "gray",   track: "active",      step: 0, isTerminal: false, hint: "Your order is being prepared." },
  pending:               { label: "Order Placed",        color: "yellow", track: "active",      step: 0, isTerminal: false, hint: "Awaiting payment confirmation." },
  pending_payment:       { label: "Awaiting Payment",    color: "yellow", track: "active",      step: 0, isTerminal: false, hint: "Complete payment to proceed." },
  confirmed:             { label: "Confirmed",           color: "blue",   track: "active",      step: 1, isTerminal: false, hint: "Payment confirmed. Preparing your order." },
  processing:            { label: "Processing",          color: "blue",   track: "active",      step: 2, isTerminal: false, hint: "Your items are being picked and packed." },
  packed:                { label: "Packed",              color: "blue",   track: "active",      step: 3, isTerminal: false, hint: "Package is ready for pickup by carrier." },
  shipped:               { label: "Shipped",             color: "purple", track: "active",      step: 4, isTerminal: false, hint: "Your order is on its way." },
  out_for_delivery:      { label: "Out for Delivery",    color: "purple", track: "active",      step: 5, isTerminal: false, hint: "Your package will arrive today." },
  delivered:             { label: "Delivered",           color: "green",  track: "active",      step: 6, isTerminal: true,  hint: "Package delivered. Enjoy your purchase!" },

  // Cancelled track
  cancelled:             { label: "Cancelled",           color: "red",    track: "cancelled",   step: 0, isTerminal: true,  hint: "Order has been cancelled." },
  failed:                { label: "Payment Failed",      color: "red",    track: "cancelled",   step: 0, isTerminal: true,  hint: "Payment could not be processed." },

  // Return track
  return_requested:      { label: "Return Requested",    color: "yellow", track: "return",      step: 0, isTerminal: false, hint: "We are reviewing your return request." },
  return_approved:       { label: "Return Approved",     color: "blue",   track: "return",      step: 1, isTerminal: false, hint: "Schedule pickup or drop off the package." },
  return_rejected:       { label: "Return Rejected",     color: "red",    track: "return",      step: 1, isTerminal: true,  hint: "Your return request was not approved." },
  return_in_transit:     { label: "Return In Transit",   color: "purple", track: "return",      step: 3, isTerminal: false, hint: "Package is on its way back to our warehouse." },
  returned:              { label: "Returned",            color: "gray",   track: "return",      step: 4, isTerminal: false, hint: "We've received your package. Inspecting now." },
  partially_returned:    { label: "Partially Returned",  color: "orange", track: "return",      step: 4, isTerminal: false, hint: "Some items returned. Refund in progress." },

  // Replacement track
  replacement_requested: { label: "Replacement Requested", color: "yellow", track: "replacement", step: 0, isTerminal: false, hint: "We are reviewing your replacement request." },
  replacement_approved:  { label: "Replacement Approved",  color: "blue",   track: "replacement", step: 1, isTerminal: false, hint: "Replacement is being prepared for dispatch." },
  replacement_rejected:  { label: "Replacement Rejected",  color: "red",    track: "replacement", step: 1, isTerminal: true,  hint: "Replacement request was not approved." },
  replacement_shipped:   { label: "Replacement Shipped",   color: "purple", track: "replacement", step: 2, isTerminal: false, hint: "Your replacement is on its way." },
  replacement_delivered: { label: "Replacement Delivered", color: "green",  track: "replacement", step: 3, isTerminal: true,  hint: "Replacement delivered successfully." },

  // Refund track
  refund_requested:      { label: "Refund Requested",    color: "yellow", track: "refund",      step: 0, isTerminal: false, hint: "Refund request is under review." },
  refund_processing:     { label: "Refund Processing",   color: "blue",   track: "refund",      step: 1, isTerminal: false, hint: "Refund is being processed by our payment partner." },
  partially_refunded:    { label: "Partially Refunded",  color: "orange", track: "refund",      step: 2, isTerminal: false, hint: "Partial refund has been issued to your account." },
  refunded:              { label: "Refunded",            color: "green",  track: "refund",      step: 2, isTerminal: true,  hint: "Full refund issued. Reflects in 3-5 business days." },
};

// ── Track step labels ─────────────────────────────────────────────────────────
export const TRACK_STEPS: Record<OrderTrack, readonly string[]> = {
  active:      ACTIVE_ORDER_STEPS,
  cancelled:   ["Cancelled"],
  return:      RETURN_STEPS,
  replacement: REPLACEMENT_STEPS,
  refund:      ["Requested", "Processing", "Refunded"],
};

// ── Tab groupings ─────────────────────────────────────────────────────────────
export type OrderTab = "all" | "active" | "delivered" | "cancelled" | "returns" | "refunds";

export function getOrderTab(status: OrderStatus): OrderTab {
  const track = ORDER_JOURNEY[status]?.track ?? "active";
  if (track === "cancelled") return "cancelled";
  if (track === "return" || track === "replacement") return "returns";
  if (track === "refund") return "refunds";
  if (status === "delivered") return "delivered";
  return "active";
}

export const TAB_LABELS: Record<OrderTab, string> = {
  all:       "All Orders",
  active:    "Active",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returns:   "Returns",
  refunds:   "Refunds",
};
