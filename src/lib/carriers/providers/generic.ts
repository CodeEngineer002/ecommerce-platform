import { createHmac, timingSafeEqual } from "crypto";
import type { CarrierProvider, NormalizedTrackingEvent } from "../types";
import { mapCarrierStatus } from "../types";

/**
 * Generic carrier provider — fallback for any carrier not explicitly supported.
 *
 * Expected webhook shape (our own standard format — useful when using
 * a third-party aggregator like AfterShip, Clickpost, or custom integrations):
 * {
 *   "tracking_number": "AWB123",
 *   "status": "Out For Delivery",
 *   "location": "Mumbai",
 *   "description": "Package is out for delivery",
 *   "timestamp": "2024-01-15T14:30:00Z",
 *   "event_id": "unique-event-id"  // optional, for deduplication
 * }
 *
 * Signature: HMAC-SHA256 of raw body with `X-Webhook-Signature` header
 */
export const genericProvider: CarrierProvider = {
  carrierId: "generic",
  name:      "Generic / Other",

  trackingUrl(trackingNumber: string) {
    return `https://www.google.com/search?q=track+${encodeURIComponent(trackingNumber)}`;
  },

  verifySignature(rawBody, headers, secret) {
    const signature = headers["x-webhook-signature"];
    if (!signature) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    try {
      return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  },

  normalizeWebhookPayload(payload) {
    const body = payload as {
      tracking_number?: string;
      status?: string;
      location?: string;
      description?: string;
      timestamp?: string;
      event_id?: string;
      // Support array of events too
      events?: Array<{
        status?: string;
        location?: string;
        description?: string;
        timestamp?: string;
        event_id?: string;
      }>;
    };

    const eventMap: Record<string, string> = {};

    // Handle both single event and array of events
    const rawEvents = body.events ?? [
      {
        status:      body.status,
        location:    body.location,
        description: body.description,
        timestamp:   body.timestamp,
        event_id:    body.event_id,
      },
    ];

    return rawEvents
      .filter((e) => e.status)
      .map((e) => {
        const carrierStatus  = e.status ?? "Unknown";
        const internalStatus = mapCarrierStatus(carrierStatus, eventMap);
        return {
          carrierStatus,
          internalStatus,
          location:      e.location,
          description:   e.description ?? carrierStatus,
          eventTime:     e.timestamp ? new Date(e.timestamp) : new Date(),
          carrierEventId: e.event_id ?? (e.timestamp ? `${body.tracking_number}-${e.timestamp}-${carrierStatus}` : undefined),
        } satisfies NormalizedTrackingEvent;
      });
  },
};
