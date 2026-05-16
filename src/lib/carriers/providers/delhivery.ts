import { createHmac, timingSafeEqual } from "crypto";
import type { CarrierProvider, NormalizedTrackingEvent } from "../types";
import { mapCarrierStatus } from "../types";

/**
 * Delhivery carrier provider.
 *
 * Webhook format (simplified):
 * {
 *   "packages": [{
 *     "waybill": "1234567890",
 *     "scans": [{
 *       "ScanDateTime": "2024-01-15 14:30:00",
 *       "Scan": "Dispatched",
 *       "ScannedLocation": "Mumbai",
 *       "Instructions": "Shipment dispatched from origin",
 *       "ScanNslRemark": ""
 *     }]
 *   }]
 * }
 *
 * Signature: HMAC-SHA256 of raw body, sent as header `X-Delhivery-Signature`
 */
export const delhiveryProvider: CarrierProvider = {
  carrierId: "delhivery",
  name:      "Delhivery",

  trackingUrl(trackingNumber: string) {
    return `https://www.delhivery.com/track/package/${trackingNumber}`;
  },

  verifySignature(rawBody, headers, secret) {
    const signature = headers["x-delhivery-signature"] ?? headers["x-webhook-signature"];
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
      packages?: Array<{
        waybill?: string;
        scans?: Array<{
          ScanDateTime?: string;
          Scan?: string;
          ScannedLocation?: string;
          Instructions?: string;
          ScanNslRemark?: string;
        }>;
      }>;
    };

    const eventMap: Record<string, string> = {
      "Manifested":       "processing",
      "Dispatched":       "shipped",
      "In Transit":       "shipped",
      "Out For Delivery": "out_for_delivery",
      "Delivered":        "delivered",
      "RTO Initiated":    "failed",
      "RTO Delivered":    "failed",
      "Failed Delivery":  "failed",
    };

    const events: NormalizedTrackingEvent[] = [];

    for (const pkg of body.packages ?? []) {
      for (const scan of pkg.scans ?? []) {
        const carrierStatus  = scan.Scan ?? "Unknown";
        const internalStatus = mapCarrierStatus(carrierStatus, eventMap);
        events.push({
          carrierStatus,
          internalStatus,
          location:    scan.ScannedLocation,
          description: scan.Instructions || scan.ScanNslRemark || carrierStatus,
          eventTime:   scan.ScanDateTime ? new Date(scan.ScanDateTime) : new Date(),
          carrierEventId: scan.ScanDateTime
            ? `${pkg.waybill}-${scan.ScanDateTime}-${carrierStatus}`
            : undefined,
        });
      }
    }

    return events;
  },
};
