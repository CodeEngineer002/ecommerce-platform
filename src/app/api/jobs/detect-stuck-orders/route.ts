import "server-only";
import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * POST /api/jobs/detect-stuck-orders
 *
 * Vercel Cron fallback for pg_cron job `shopnest:detect-stuck-orders`.
 * Scans orders that have exceeded SLA thresholds and creates
 * `order_exceptions` entries for admin review.
 *
 * Secured with `Authorization: Bearer <CRON_SECRET>`.
 * Vercel Cron config in vercel.json:
 *   { "path": "/api/jobs/detect-stuck-orders", "schedule": "every 15 minutes" }
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!serverEnv.CRON_SECRET || token !== serverEnv.CRON_SECRET) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();

  const { data, error } = await db.rpc("detect_stuck_orders");

  if (error) {
    logger.warn("detect-stuck-orders job failed", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const exceptions = data ?? 0;
  logger.info(`detect-stuck-orders: created ${exceptions} exceptions`, { channel: "order" });
  return NextResponse.json({ exceptions });
}
