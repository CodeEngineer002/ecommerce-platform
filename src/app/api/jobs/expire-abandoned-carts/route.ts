import "server-only";
import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * GET  /api/jobs/expire-abandoned-carts  — invoked by Vercel Cron (sends GET)
 * POST /api/jobs/expire-abandoned-carts  — manual trigger / CI
 *
 * Vercel Cron fallback for pg_cron job `shopnest:expire-abandoned-carts`.
 * Marks carts that have exceeded their TTL as `expired` and releases
 * any reserved inventory associated with those carts.
 *
 * Secured with `Authorization: Bearer <CRON_SECRET>`.
 * Schedule (vercel.json): hourly  →  "0 * * * *"
 */
async function runJob() {
  const db = createServiceClient();
  const { error } = await db.rpc("expire_abandoned_carts");
  if (error) {
    logger.warn("expire-abandoned-carts job failed", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  logger.info("expire-abandoned-carts: completed", { channel: "cart" });
  return NextResponse.json({ ok: true });
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
