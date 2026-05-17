import "server-only";
import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * GET  /api/jobs/detect-stuck-orders  — invoked by Vercel Cron (sends GET)
 * POST /api/jobs/detect-stuck-orders  — manual trigger / CI
 *
 * Vercel Cron fallback for pg_cron job `shopnest:detect-stuck-orders`.
 * Scans orders that have exceeded SLA thresholds and creates
 * `order_exceptions` entries for admin review.
 *
 * Secured with `Authorization: Bearer <CRON_SECRET>`.
 * Schedule (vercel.json): every 15 minutes  →  "* /15 * * * *"
 */
async function runJob() {
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

function authorize(request: Request): boolean {
  const auth  = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return Boolean(serverEnv.CRON_SECRET && token === serverEnv.CRON_SECRET);
}

export async function GET(request: Request) {
  if (!authorize(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  return runJob();
}

export async function POST(request: Request) {
  if (!authorize(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  return runJob();
}
