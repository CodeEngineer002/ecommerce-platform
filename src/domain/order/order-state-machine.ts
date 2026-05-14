import { AppError } from "@/lib/errors";

// ── Order lifecycle states ────────────────────────────────────────────────────
export type OrderStatus =
  | "draft"               // checkout initiated, payment not yet attempted
  | "pending"             // order created (legacy — treat as pending_payment)
  | "pending_payment"     // awaiting payment confirmation
  | "confirmed"           // payment confirmed
  | "processing"          // being packed / prepared for shipment
  | "shipped"             // handed to carrier
  | "delivered"           // confirmed delivery
  | "cancelled"           // cancelled before or after shipment
  | "partially_returned"  // some items returned, rest delivered
  | "partially_refunded"  // partial refund issued
  | "refunded";           // full refund issued

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft:              ["pending", "pending_payment", "cancelled"],
  pending:            ["confirmed", "pending_payment", "cancelled"],
  pending_payment:    ["confirmed", "cancelled"],
  confirmed:          ["processing", "cancelled"],
  processing:         ["shipped", "cancelled"],
  shipped:            ["delivered", "cancelled"],
  delivered:          ["partially_returned", "partially_refunded", "refunded"],
  cancelled:          ["refunded"],
  partially_returned: ["refunded", "partially_refunded"],
  partially_refunded: ["refunded"],
  refunded:           [],
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
  "shipped",
] as const;

export function isOrderCancellable(status: OrderStatus): boolean {
  return (CANCELLABLE_ORDER_STATUSES as readonly string[]).includes(status);
}

export function isOrderTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0;
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
  unpaid:              ["pending"],
  pending:             ["authorized", "paid", "failed"],
  authorized:          ["paid", "failed"],
  paid:                ["refunded", "partially_refunded"],
  failed:              ["pending"], // allows retry
  refunded:            [],
  partially_refunded:  ["refunded"],
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
  unfulfilled:          ["processing"],
  processing:           ["partially_fulfilled", "fulfilled", "failed"],
  partially_fulfilled:  ["fulfilled", "failed"],
  fulfilled:            ["shipped"],
  shipped:              ["delivered", "failed"],
  delivered:            [],
  failed:               ["processing"], // allows retry
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
