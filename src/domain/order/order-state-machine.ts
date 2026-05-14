import { AppError } from "@/lib/errors";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

const VALID_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending:    ["confirmed", "cancelled"],
  confirmed:  ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped:    ["delivered", "cancelled"],
  delivered:  ["refunded"],
  cancelled:  ["refunded"],
  refunded:   [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (VALID_TRANSITIONS[from] as readonly string[]).includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError(
      `Cannot transition order from '${from}' to '${to}'`,
      "INVALID_STATE_TRANSITION",
      409,
    );
  }
}

export function getValidNextStates(status: OrderStatus): readonly OrderStatus[] {
  return VALID_TRANSITIONS[status];
}

export const CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
] as const;

export function isCancellable(status: OrderStatus): boolean {
  return (CANCELLABLE_STATUSES as readonly string[]).includes(status);
}

export function isTerminal(status: OrderStatus): boolean {
  return VALID_TRANSITIONS[status].length === 0;
}
