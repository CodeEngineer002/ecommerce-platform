import "server-only";
import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { sendCartAbandonedEmail } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * GET  /api/jobs/expire-abandoned-carts  — invoked by Vercel Cron (sends GET)
 * POST /api/jobs/expire-abandoned-carts  — manual trigger / CI
 *
 * Two-stage cart lifecycle (Path-B P1):
 *   1. mark_abandoned_carts(24)  — active → abandoned at 24h of inactivity.
 *                                  Returns affected (cart_id, user_id) so
 *                                  the route can fan-out recovery emails to
 *                                  authenticated owners.
 *   2. expire_abandoned_carts()   — active|abandoned → expired when past the
 *                                  hard 30-day TTL.
 *
 * Both RPCs write cart_events rows for audit.
 *
 * Secured with `Authorization: Bearer <CRON_SECRET>`.
 * Schedule (vercel.json): hourly  →  "0 * * * *"
 */
const ABANDONED_THRESHOLD_HOURS = 24;

async function runJob() {
  const db = createServiceClient();

  // ── Stage 1: mark abandoned, get newly-abandoned cart owners ──────────
  const { data: newlyAbandoned, error: markErr } = await db.rpc(
    "mark_abandoned_carts",
    { p_threshold_hours: ABANDONED_THRESHOLD_HOURS },
  );

  if (markErr) {
    logger.warn("mark_abandoned_carts failed", { error: markErr.message });
    return NextResponse.json({ error: markErr.message }, { status: 500 });
  }

  const abandonedRows = (newlyAbandoned ?? []) as { cart_id: string; user_id: string | null }[];
  const userCartOwners = abandonedRows.filter((r) => r.user_id !== null);

  // Fire-and-forget recovery emails for authenticated owners (guests have no
  // email; their session-id cookie is the only handle).
  let emailsSent = 0;
  if (userCartOwners.length > 0) {
    // Batch-fetch profile + item count to keep this an O(2) round-trip instead of O(N).
    const userIds  = userCartOwners.map((r) => r.user_id!) as string[];
    const cartIds  = userCartOwners.map((r) => r.cart_id);

    const [{ data: profiles }, { data: items }] = await Promise.all([
      db.from("profiles").select("id, email, full_name").in("id", userIds),
      db.from("cart_items").select("cart_id").in("cart_id", cartIds),
    ]);

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const itemCountByCart = new Map<string, number>();
    for (const it of items ?? []) {
      itemCountByCart.set(it.cart_id, (itemCountByCart.get(it.cart_id) ?? 0) + 1);
    }

    for (const row of userCartOwners) {
      const profile = row.user_id ? profileById.get(row.user_id) : null;
      if (!profile?.email) continue;
      const count = itemCountByCart.get(row.cart_id) ?? 0;
      if (count === 0) continue;
      try {
        await sendCartAbandonedEmail({
          to:           profile.email,
          customerName: profile.full_name ?? "Customer",
          itemCount:    count,
        });
        emailsSent += 1;
      } catch (err) {
        logger.warn("cart-abandoned email failed", {
          cart_id: row.cart_id,
          error:   err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // ── Stage 2: expire hard-TTL carts ──────────────────────────────────────
  const { data: expiredCount, error: expireErr } = await db.rpc("expire_abandoned_carts");
  if (expireErr) {
    logger.warn("expire_abandoned_carts failed", { error: expireErr.message });
    return NextResponse.json({ error: expireErr.message }, { status: 500 });
  }

  const summary = {
    abandoned: abandonedRows.length,
    expired:   (expiredCount ?? 0) as number,
    emails:    emailsSent,
  };
  logger.info("expire-abandoned-carts: completed", { channel: "cart", ...summary });
  return NextResponse.json(summary);
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
