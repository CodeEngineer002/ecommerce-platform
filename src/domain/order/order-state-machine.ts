import { AppError } from "@/lib/errors";

// ── Order lifecycle states ────────────────────────────────────────────────────
export type OrderStatus =
  | "draft"                  // checkout initiated, payment not yet attempted
  | "pending"                // order created (legacy / COD flow)
  | "pending_payment"        // awaiting payment confirmation
  | "confirmed"              // payment confirmed
  | "processing"             // being prepared for shipment
  | "packed"                 // packed and ready for carrier pickup
  | "shipped"                // handed to carrier
  | "out_for_delivery"       // last-mile delivery in progress
  | "delivered"              // confirmed delivery
  | "cancelled"              // cancelled before fulfilment
  | "failed"                 // payment or processing failure
  | "return_requested"       // customer submitted return request
  | "return_approved"        // admin approved the return
  | "return_rejected"        // admin rejected the return request
  | "return_in_transit"      // item is on its way back
  | "returned"               // item physically received back
  | "replacement_requested"  // customer requested replacement
  | "replacement_approved"   // admin approved replacement
  | "replacement_rejected"   // admin rejected replacement request
  | "replacement_shipped"    // replacement dispatched
  | "replacement_delivered"  // replacement delivered
  | "refund_requested"       // refund requested (without return, e.g. admin courtesy)
  | "refund_processing"      // refund being processed by payment gateway
  | "partially_returned"     // subset of items returned, rest delivered
  | "partially_refunded"     // partial refund issued
  | "refunded";              // full refund issued

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft:                 ["pending", "pending_payment", "cancelled"],
  pending:               ["confirmed", "pending_payment", "cancelled"],
  pending_payment:       ["confirmed", "cancelled", "failed"],
  confirmed:             ["processing", "cancelled"],
  processing:            ["packed", "shipped", "cancelled"],
  packed:                ["shipped", "cancelled"],
  shipped:               ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery:      ["delivered"],
  delivered:             ["return_requested", "replacement_requested", "refund_requested",
                          "partially_returned", "partially_refunded", "refunded"],
  cancelled:             ["refunded"],
  failed:                ["pending_payment"],
  return_requested:      ["return_approved", "return_rejected"],
  return_approved:       ["return_in_transit"],
  return_rejected:       [],
  return_in_transit:     ["returned"],
  returned:              ["refunded", "replacement_shipped"],
  replacement_requested: ["replacement_approved", "replacement_rejected"],
  replacement_approved:  ["replacement_shipped"],
  replacement_rejected:  [],
  replacement_shipped:   ["replacement_delivered"],
  replacement_delivered: [],
  refund_requested:      ["refund_processing"],
  refund_processing:     ["refunded", "partially_refunded"],
  partially_returned:    ["return_requested", "replacement_requested", "refund_requested",
                          "refunded", "partially_refunded"],
  partially_refunded:    ["refunded"],
  refunded:              [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_TRANSITIONS[from] as readonly string[]).includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new AppError(
      `Cannot transition order from '${from}' to '${to}'`,
      "INVALID_STATE_TRANSITION",
      409,
    );
  }
}

export function getValidOrderNextStates(status: OrderStatus): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[status];
}

export const CANCELLABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "draft",
  "pending",
  "pending_payment",
  "confirmed",
  "processing",
  "packed",
  "shipped",
] as const;

export function isOrderCancellable(status: OrderStatus): boolean {
  return (CANCELLABLE_ORDER_STATUSES as readonly string[]).includes(status);
}

export function isOrderTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0;
}

// ── Return request lifecycle states ──────────────────────────────────────────
export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "pickup_scheduled"
  | "in_transit"
  | "received"
  | "inspected"
  | "accepted"
  | "rejected_after_inspection"
  | "refunded"
  | "replaced"
  | "closed";

const RETURN_TRANSITIONS: Record<ReturnStatus, readonly ReturnStatus[]> = {
  requested:                 ["approved", "rejected"],
  approved:                  ["pickup_scheduled", "in_transit"],
  rejected:                  [],
  pickup_scheduled:          ["in_transit"],
  in_transit:                ["received"],
  received:                  ["inspected"],
  inspected:                 ["accepted", "rejected_after_inspection"],
  accepted:                  ["refunded", "replaced"],
  rejected_after_inspection: ["closed"],
  refunded:                  ["closed"],
  replaced:                  ["closed"],
  closed:                    [],
};

export function canTransitionReturn(from: ReturnStatus, to: ReturnStatus): boolean {
  return (RETURN_TRANSITIONS[from] as readonly string[]).includes(to);
}

export function assertReturnTransition(from: ReturnStatus, to: ReturnStatus): void {
  if (!canTransitionReturn(from, to)) {
    throw new AppError(
      `Cannot transition return from '${from}' to '${to}'`,
      "INVALID_RETURN_TRANSITION",
      409,
    );
  }
}

// ── Replacement lifecycle states ──────────────────────────────────────────────
export type ReplacementStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "processing"
  | "shipped"
  | "delivered";

const REPLACEMENT_TRANSITIONS: Record<ReplacementStatus, readonly ReplacementStatus[]> = {
  requested:  ["approved", "rejected"],
  approved:   ["processing"],
  rejected:   [],
  processing: ["shipped"],
  shipped:    ["delivered"],
  delivered:  [],
};

export function canTransitionReplacement(from: ReplacementStatus, to: ReplacementStatus): boolean {
  return (REPLACEMENT_TRANSITIONS[from] as readonly string[]).includes(to);
}

export function assertReplacementTransition(from: ReplacementStatus, to: ReplacementStatus): void {
  if (!canTransitionReplacement(from, to)) {
    throw new AppError(
      `Cannot transition replacement from '${from}' to '${to}'`,
      "INVALID_REPLACEMENT_TRANSITION",
      409,
    );
  }
}

// ── Refund lifecycle states ───────────────────────────────────────────────────
export type RefundStatus = "pending" | "processing" | "succeeded" | "failed";

const REFUND_TRANSITIONS: Record<RefundStatus, readonly RefundStatus[]> = {
  pending:    ["processing", "failed"],
  processing: ["succeeded", "failed"],
  failed:     ["pending"],
  succeeded:  [],
};

export function canTransitionRefund(from: RefundStatus, to: RefundStatus): boolean {
  return (REFUND_TRANSITIONS[from] as readonly string[]).includes(to);
}

// ── Payment lifecycle states ──────────────────────────────────────────────────
export type PaymentLifecycleStatus =
  | "unpaid"
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "refunded"
  | "partially_refunded";

const PAYMENT_TRANSITIONS: Record<PaymentLifecycleStatus, readonly PaymentLifecycleStatus[]> = {
  unpaid:             ["pending"],
  pending:            ["authorized", "paid", "failed"],
  authorized:         ["paid", "failed"],
  paid:               ["refunded", "partially_refunded"],
  failed:             ["pending"],
  refunded:           [],
  partially_refunded: ["refunded"],
};

export function canTransitionPayment(
  from: PaymentLifecycleStatus,
  to: PaymentLifecycleStatus,
): boolean {
  return (PAYMENT_TRANSITIONS[from] as readonly string[]).includes(to);
}

export function assertPaymentTransition(
  from: PaymentLifecycleStatus,
  to: PaymentLifecycleStatus,
): void {
  if (!canTransitionPayment(from, to)) {
    throw new AppError(
      `Cannot transition payment from '${from}' to '${to}'`,
      "INVALID_PAYMENT_TRANSITION",
      409,
    );
  }
}

// ── Fulfillment lifecycle states ──────────────────────────────────────────────
export type FulfillmentStatus =
  | "unfulfilled"
  | "processing"
  | "partially_fulfilled"
  | "fulfilled"
  | "shipped"
  | "delivered"
  | "failed";

const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, readonly FulfillmentStatus[]> = {
  unfulfilled:         ["processing"],
  processing:          ["partially_fulfilled", "fulfilled", "failed"],
  partially_fulfilled: ["fulfilled", "failed"],
  fulfilled:           ["shipped"],
  shipped:             ["delivered", "failed"],
  delivered:           [],
  failed:              ["processing"],
};

export function canTransitionFulfillment(from: FulfillmentStatus, to: FulfillmentStatus): boolean {
  return (FULFILLMENT_TRANSITIONS[from] as readonly string[]).includes(to);
}

export function assertFulfillmentTransition(
  from: FulfillmentStatus,
  to: FulfillmentStatus,
): void {
  if (!canTransitionFulfillment(from, to)) {
    throw new AppError(
      `Cannot transition fulfillment from '${from}' to '${to}'`,
      "INVALID_FULFILLMENT_TRANSITION",
      409,
    );
  }
}

// ── Legacy exports (backward compat) ─────────────────────────────────────────
export const canTransition = canTransitionOrder;
export const assertTransition = assertOrderTransition;
export const getValidNextStates = getValidOrderNextStates;
export const CANCELLABLE_STATUSES = CANCELLABLE_ORDER_STATUSES;
export const isCancellable = isOrderCancellable;
export const isTerminal = isOrderTerminal;
