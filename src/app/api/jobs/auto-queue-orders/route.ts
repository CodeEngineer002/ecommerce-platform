import "server-only";
import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * POST /api/jobs/auto-queue-orders
 *
 * Vercel Cron fallback for pg_cron job `shopnest:auto-queue-confirmed-orders`.
 * Moves confirmed orders (>2 min old, no fulfillment) → processing,
 * creates a fulfillment record with an auto-generated tracking number.
 *
 * Secured with `Authorization: Bearer <CRON_SECRET>`.
 * Vercel Cron config in vercel.json:
 *   { "path": "/api/jobs/auto-queue-orders", "schedule": "every 5 minutes" }
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!serverEnv.CRON_SECRET || token !== serverEnv.CRON_SECRET) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();

  const { data, error } = await db.rpc("auto_queue_confirmed_orders");

  if (error) {
    logger.warn("auto-queue-orders job failed", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const queued = data ?? 0;
  logger.info(`auto-queue-orders: queued ${queued} orders`, { channel: "order" });
  return NextResponse.json({ queued });
}
