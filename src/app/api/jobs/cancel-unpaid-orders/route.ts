import "server-only";
import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * GET  /api/jobs/cancel-unpaid-orders  — invoked by Vercel Cron (sends GET)
 * POST /api/jobs/cancel-unpaid-orders  — manual trigger / CI
 *
 * Vercel Cron fallback for pg_cron job `shopnest:cancel-unpaid-orders`.
 * Cancels orders that are stuck in:
 *   - `pending_payment` for > 30 minutes  (Stripe abandoned checkout)
 *   - `pending`         for > 24 hours    (order created but never confirmed)
 * Releases inventory reservations for cancelled orders.
 *
 * Secured with `Authorization: Bearer <CRON_SECRET>`.
 * Schedule (vercel.json): every 10 minutes  →  "* /10 * * * *"
 */
async function runJob() {
  const db = createServiceClient();
  const { data, error } = await db.rpc("cancel_unpaid_orders");
  if (error) {
    logger.warn("cancel-unpaid-orders job failed", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const cancelled = data ?? 0;
  logger.info(`cancel-unpaid-orders: cancelled ${cancelled} orders`, { channel: "order" });
  return NextResponse.json({ cancelled });
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
