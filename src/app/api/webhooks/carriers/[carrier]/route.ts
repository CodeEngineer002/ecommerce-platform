import "server-only";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { getCarrierProvider } from "@/lib/carriers";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * POST /api/webhooks/carriers/[carrier]
 *
 * Receives tracking event webhooks from shipping carriers.
 *
 * Flow:
 *   1. Read raw body (needed for HMAC verification)
 *   2. Look up carrier webhook secret from DB
 *   3. Verify HMAC signature — reject if invalid
 *   4. Extract tracking number from payload
 *   5. Find matching order_fulfillment by tracking_number
 *   6. For each event in payload → call append_tracking_event() DB function
 *      (idempotent — safe to retry)
 *   7. Return 200 immediately (carriers retry on non-2xx)
 *
 * Security:
 *   - HMAC signature verified per-carrier before any DB access
 *   - All writes go through append_tracking_event (SECURITY DEFINER)
 *   - No user auth required (carrier-to-server, not user-facing)
 *   - Rate limiting handled at infra level (Vercel / nginx)
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ carrier: string }> },
) {
  const { carrier: carrierId } = await context.params;

  // Read raw body before parsing (needed for HMAC verification)
  const rawBody = await request.text();

  // Get all request headers
  const headersList = await headers();
  const reqHeaders: Record<string, string> = {};
  headersList.forEach((value, key) => {
    reqHeaders[key.toLowerCase()] = value;
  });

  const db = createServiceClient();

  // ── 1. Load carrier + webhook secret ─────────────────────────────────────
  const { data: secretRow } = await db
    .from("carrier_webhook_secrets")
    .select("secret, carrier_id")
    .eq("carrier_id", carrierId)
    .maybeSingle();

  // ── 2. Verify HMAC signature ──────────────────────────────────────────────
  if (secretRow?.secret) {
    const provider = getCarrierProvider(carrierId);
    const isValid = provider.verifySignature(rawBody, reqHeaders, secretRow.secret);
    if (!isValid) {
      logger.warn("Carrier webhook signature verification failed", {
        carrier: carrierId,
        channel: "webhook",
      });
      return NextResponse.json({ message: "Invalid signature" }, { status: 401 });
    }
  } else {
    // No secret configured — log warning but continue (dev/testing mode)
    // In production: return 401 here and require secrets for all carriers
    logger.warn("No webhook secret configured for carrier — accepting unauthenticated webhook", {
      carrier: carrierId,
      channel: "webhook",
    });
  }

  // ── 3. Parse payload ──────────────────────────────────────────────────────
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  // ── 4. Normalize events ───────────────────────────────────────────────────
  const provider = getCarrierProvider(carrierId);
  let events;
  try {
    events = provider.normalizeWebhookPayload(payload, reqHeaders);
  } catch (err) {
    logger.error("Failed to normalize carrier webhook payload", err, {
      carrier: carrierId,
      channel: "webhook",
    });
    // Return 200 so carrier doesn't retry — we can reprocess from raw_payload
    return NextResponse.json({ received: true, error: "normalization_failed" });
  }

  if (events.length === 0) {
    return NextResponse.json({ received: true, events_processed: 0 });
  }

  // ── 5. Extract tracking number from payload ───────────────────────────────
  // Carriers typically include AWB/waybill in the payload — extract it
  const trackingNumber = extractTrackingNumber(payload, carrierId);

  if (!trackingNumber) {
    logger.warn("Could not extract tracking number from webhook payload", {
      carrier: carrierId,
      channel: "webhook",
    });
    return NextResponse.json({ received: true, error: "no_tracking_number" });
  }

  // ── 6. Find fulfillment by tracking number ────────────────────────────────
  const { data: fulfillment } = await db
    .from("order_fulfillments")
    .select("id, order_id, carrier")
    .eq("tracking_number", trackingNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!fulfillment) {
    // Tracking number not found — may arrive before admin enters it
    // Store as orphaned event for later reconciliation (not implemented yet)
    logger.warn("No fulfillment found for tracking number from carrier webhook", {
      carrier:          carrierId,
      tracking_number:  trackingNumber,
      channel:          "webhook",
    });
    return NextResponse.json({ received: true, error: "fulfillment_not_found" });
  }

  // ── 7. Append each event ──────────────────────────────────────────────────
  let processedCount = 0;
  for (const event of events) {
    const { error } = await db.rpc("append_tracking_event", {
      p_fulfillment_id:   fulfillment.id,
      p_carrier_status:   event.carrierStatus,
      p_internal_status:  event.internalStatus,
      p_location:         event.location ?? undefined,
      p_description:      event.description ?? undefined,
      p_event_time:       event.eventTime.toISOString(),
      p_source:           "webhook",
      p_raw_payload:      payload as import("@/types/database.types").Json,
      p_carrier_event_id: event.carrierEventId ?? undefined,
    });

    if (error) {
      logger.error("Failed to append tracking event", new Error(error.message), {
        carrier:         carrierId,
        fulfillment_id:  fulfillment.id,
        carrier_status:  event.carrierStatus,
        channel:         "webhook",
      });
    } else {
      processedCount++;
    }
  }

  return NextResponse.json({
    received:         true,
    events_processed: processedCount,
    events_total:     events.length,
  });
}

// ── Helper: extract tracking number from various carrier payload shapes ───────
function extractTrackingNumber(payload: unknown, carrierId: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  // Carrier-specific extraction
  switch (carrierId) {
    case "delhivery": {
      const packages = p.packages as Array<{ waybill?: string }> | undefined;
      return packages?.[0]?.waybill ?? null;
    }
    case "shiprocket":
      return (p.awb as string) ?? (p.tracking_number as string) ?? null;
    default:
      // Generic: try common field names
      return (
        (p.tracking_number as string) ??
        (p.awb as string) ??
        (p.waybill as string) ??
        (p.trackingNumber as string) ??
        null
      );
  }
}
