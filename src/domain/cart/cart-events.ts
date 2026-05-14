/**
 * Cart event emitter.
 *
 * Writes structured events to the `cart_events` table for:
 *   - Lifecycle audit trail
 *   - Abandoned cart automation
 *   - Analytics pipeline (no hardcoded provider)
 *
 * All writes use the service client (bypasses RLS) since cart_events
 * has service_role-only write policy.
 *
 * In tests this module is mocked — real DB writes only in integration.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import type { CartEventType } from "./types";

export interface CartEventPayload {
  cartId: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function emitCartEvent(
  db: SupabaseClient,
  eventType: CartEventType,
  payload: CartEventPayload,
): Promise<void> {
  const { error } = await db.from("cart_events").insert({
    cart_id: payload.cartId,
    event_type: eventType,
    actor_id: payload.actorId ?? null,
    metadata: payload.metadata ?? {},
  });

  if (error) {
    // Cart events are best-effort — a failed event write should NOT
    // roll back the main cart operation. Log and continue.
    logger.warn("[cart-events] Failed to write cart event", {
      eventType,
      cartId: payload.cartId,
      error: error.message,
    });
  }
}
