import { createHmac, timingSafeEqual } from "crypto";
import type { CarrierProvider, NormalizedTrackingEvent } from "../types";
import { mapCarrierStatus } from "../types";

/**
 * Shiprocket carrier provider.
 *
 * Shiprocket aggregates multiple carriers (Delhivery, BlueDart, Ecom, etc.)
 * and sends a unified webhook:
 * {
 *   "awb": "1234567890",
 *   "current_status": "DELIVERED",
 *   "current_status_id": 7,
 *   "shipment_track_activities": [{
 *     "date": "2024-01-15 14:30:00",
 *     "activity": "Delivered",
 *     "location": "Mumbai",
 *     "sr-status": "DELIVERED",
 *     "sr-status-label": "Delivered"
 *   }]
 * }
 *
 * Signature: SHA256 HMAC of raw body with `X-Shiprocket-Signature` header
 */
export const shiprocketProvider: CarrierProvider = {
  carrierId: "shiprocket",
  name:      "Shiprocket",

  trackingUrl(trackingNumber: string) {
    return `https://shiprocket.co/tracking/${trackingNumber}`;
  },

  verifySignature(rawBody, headers, secret) {
    const signature = headers["x-shiprocket-signature"] ?? headers["x-webhook-signature"];
    if (!signature) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  },

  normalizeWebhookPayload(payload) {
    const body = payload as {
      awb?: string;
      current_status?: string;
      shipment_track_activities?: Array<{
        date?: string;
        activity?: string;
        location?: string;
        "sr-status"?: string;
        "sr-status-label"?: string;
      }>;
    };

    const eventMap: Record<string, string> = {
      "NEW":               "processing",
      "PICKUP PENDING":    "processing",
      "PICKUP QUEUED":     "processing",
      "PICKED UP":         "shipped",
      "IN TRANSIT":        "shipped",
      "OUT FOR DELIVERY":  "out_for_delivery",
      "DELIVERED":         "delivered",
      "UNDELIVERED":       "failed",
      "RTO INITIATED":     "failed",
      "RTO DELIVERED":     "failed",
    };

    const events: NormalizedTrackingEvent[] = [];

    for (const activity of body.shipment_track_activities ?? []) {
      const carrierStatus  = activity["sr-status"] ?? activity.activity ?? "Unknown";
      const internalStatus = mapCarrierStatus(carrierStatus, eventMap);
      events.push({
        carrierStatus,
        internalStatus,
        location:    activity.location,
        description: activity["sr-status-label"] ?? activity.activity,
        eventTime:   activity.date ? new Date(activity.date) : new Date(),
        carrierEventId: activity.date
          ? `${body.awb}-${activity.date}-${carrierStatus}`
          : undefined,
      });
    }

    return events;
  },
};
