/**
 * Cart lifecycle state machine.
 *
 * Enforces valid cart status transitions. Mirrors the same pattern
 * as order-state-machine.ts for consistency.
 */

import type { CartStatus } from "./types";

import {
  CartAlreadyConvertedError,
  CartExpiredError,
  CartNotActiveError,
} from "./errors";

// ── Allowed transitions ───────────────────────────────────────────────────────
//
// active    → abandoned, expired, merged, converted, deleted
// abandoned → active (re-activation), expired, merged, converted, deleted
// expired   → deleted  (no recovery — create a new cart)
// merged    → deleted  (terminal)
// converted → (terminal)
// deleted   → (terminal)

const ALLOWED_TRANSITIONS: Record<CartStatus, CartStatus[]> = {
  active:    ["abandoned", "expired", "merged", "converted", "deleted"],
  abandoned: ["active",    "expired", "merged", "converted", "deleted"],
  expired:   ["deleted"],
  merged:    ["deleted"],
  converted: [],
  deleted:   [],
};

/** Statuses from which the cart can still be mutated (items added/removed). */
export const MUTABLE_CART_STATUSES: CartStatus[] = ["active"];

/** Terminal statuses — no further transitions allowed. */
export const TERMINAL_CART_STATUSES: CartStatus[] = ["converted", "deleted"];

// ── Guards ────────────────────────────────────────────────────────────────────

export function canTransitionCart(from: CartStatus, to: CartStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertCartTransition(from: CartStatus, to: CartStatus): void {
  if (!canTransitionCart(from, to)) {
    throw new CartNotActiveError(from);
  }
}

export function assertCartMutable(status: CartStatus): void {
  if (status === "converted") {
    throw new CartAlreadyConvertedError();
  }
  if (status === "expired") {
    throw new CartExpiredError();
  }
  if (!MUTABLE_CART_STATUSES.includes(status)) {
    throw new CartNotActiveError(status);
  }
}

export function isCartMutable(status: CartStatus): boolean {
  return MUTABLE_CART_STATUSES.includes(status);
}

export function isCartTerminal(status: CartStatus): boolean {
  return TERMINAL_CART_STATUSES.includes(status);
}

export function getValidCartNextStates(current: CartStatus): CartStatus[] {
  return ALLOWED_TRANSITIONS[current];
}
