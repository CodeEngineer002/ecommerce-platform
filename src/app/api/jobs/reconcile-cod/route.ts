import "server-only";
import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * POST /api/jobs/reconcile-cod
 *
 * Vercel Cron fallback for pg_cron job `shopnest:reconcile-cod`.
 * Finds COD orders delivered 48h+ ago without cash collection
 * and creates `order_exceptions` entries for admin review.
 *
 * Secured with `Authorization: Bearer <CRON_SECRET>`.
 * Vercel Cron config in vercel.json:
 *   { "path": "/api/jobs/reconcile-cod", "schedule": "0 * * * *" }
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!serverEnv.CRON_SECRET || token !== serverEnv.CRON_SECRET) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

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
