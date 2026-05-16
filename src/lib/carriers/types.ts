/**
 * Carrier abstraction layer.
 *
 * Architecture:
 *   - Each carrier implements the `CarrierProvider` interface
 *   - `getCarrierProvider(carrierId)` returns the right implementation
 *   - Webhook payload normalization is per-carrier
 *   - All providers output `NormalizedTrackingEvent[]`
 *
 * Adding a new carrier:
 *   1. Create `src/lib/carriers/providers/<name>.ts`
 *   2. Implement `CarrierProvider`
 *   3. Register in `CARRIER_REGISTRY` below
 */

export interface NormalizedTrackingEvent {
  /** Carrier's raw status string */
  carrierStatus: string;
  /** Our internal status — maps to order_fulfillments.status enum */
  internalStatus: "processing" | "packed" | "shipped" | "out_for_delivery" | "delivered" | "failed";
  /** Hub / city where scan happened */
  location?: string;
  /** Human-readable description */
  description?: string;
  /** Carrier-reported time of event */
  eventTime: Date;
  /** Carrier's own event ID for deduplication (if available) */
  carrierEventId?: string;
}

export interface CarrierProvider {
  carrierId: string;
  name: string;

  /**
   * Normalize a raw carrier webhook payload into our standard events.
   * Returns an array because a single webhook can carry multiple scan events.
   */
  normalizeWebhookPayload(
    payload: unknown,
    headers: Record<string, string>,
  ): NormalizedTrackingEvent[];

  /**
   * Verify the webhook's HMAC signature.
   * Returns true if valid, false if invalid.
   * Throw if the signature is malformed (not just wrong).
   */
  verifySignature(
    rawBody: string,
    headers: Record<string, string>,
    secret: string,
  ): boolean;

  /**
   * Generate a tracking URL for a given tracking number.
   */
  trackingUrl(trackingNumber: string): string;
}

// ── Internal status rank map (higher = further along lifecycle) ───────────────
export const INTERNAL_STATUS_RANK: Record<string, number> = {
  processing:       1,
  packed:           2,
  shipped:          3,
  out_for_delivery: 4,
  delivered:        5,
  failed:           6,
};

/**
 * Maps a carrier's raw status string → our internal status.
 * Uses the carrier's webhook_event_map from the DB (passed as a record here).
 */
export function mapCarrierStatus(
  carrierStatus: string,
  eventMap: Record<string, string>,
): NormalizedTrackingEvent["internalStatus"] {
  const mapped = eventMap[carrierStatus];
  if (mapped && mapped in INTERNAL_STATUS_RANK) {
    return mapped as NormalizedTrackingEvent["internalStatus"];
  }
  // Fallback heuristics
  const lower = carrierStatus.toLowerCase();
  if (lower.includes("deliver") && !lower.includes("un") && !lower.includes("fail")) return "delivered";
  if (lower.includes("out for") || lower.includes("out_for")) return "out_for_delivery";
  if (lower.includes("transit") || lower.includes("in transit")) return "shipped";
  if (lower.includes("rto") || lower.includes("failed") || lower.includes("undelivered") || lower.includes("return")) return "failed";
  return "shipped"; // safe default
}
