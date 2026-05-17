import "server-only";
import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * GET  /api/jobs/reconcile-cod  — invoked by Vercel Cron (sends GET)
 * POST /api/jobs/reconcile-cod  — manual trigger / CI
 *
 * Vercel Cron fallback for pg_cron job `shopnest:reconcile-cod`.
 * Finds COD orders delivered 48h+ ago without cash collection
 * and creates `order_exceptions` entries for admin review.
 *
 * Secured with `Authorization: Bearer <CRON_SECRET>`.
 * Schedule (vercel.json): hourly  →  "0 * * * *"
 */
async function runJob() {
  const db = createServiceClient();
  const { data, error } = await db.rpc("reconcile_cod_pending_collection");
  if (error) {
    logger.warn("reconcile-cod job failed", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const flagged = data ?? 0;
  logger.info(`reconcile-cod: flagged ${flagged} orders`, { channel: "order" });
  return NextResponse.json({ flagged });
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
