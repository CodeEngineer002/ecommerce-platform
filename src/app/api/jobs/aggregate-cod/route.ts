import "server-only";
import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * GET  /api/jobs/aggregate-cod  — invoked by Vercel Cron (sends GET)
 * POST /api/jobs/aggregate-cod  — manual trigger / CI
 *
 * Daily rollup: aggregates yesterday's COD cash collections into
 * cod_daily_reconciliation, one row per (date, agent). Idempotent — safe to
 * re-run.
 *
 * Secured with `Authorization: Bearer <CRON_SECRET>`.
 * Schedule (vercel.json): daily at 02:00 UTC → "0 2 * * *"
 */
async function runJob() {
  const db = createServiceClient();
  const { data, error } = await db.rpc("aggregate_cod_collections_yesterday");
  if (error) {
    logger.warn("aggregate-cod job failed", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rowsTouched = data ?? 0;
  logger.info(`aggregate-cod: refreshed ${rowsTouched} reconciliation rows`, {
    channel: "order",
  });
  return NextResponse.json({ rowsTouched });
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
