import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { idempotencyCheck, idempotencyStore } from "@/lib/api/idempotency";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { NotFoundError, OrderStateError } from "@/lib/errors";

const verifySchema = z.object({
  action: z.literal("verify"),
  note:   z.string().max(500).optional(),
});

const failSchema = z.object({
  action: z.literal("fail"),
  reason: z.string().min(3).max(500),
});

const schema = z.discriminatedUnion("action", [verifySchema, failSchema]);

/**
 * POST /api/admin/orders/[id]/cod-verify
 *
 * Admin records the result of a COD verification call.
 *   - action="verify"  → marks order as verified (auto-queue can ship it)
 *   - action="fail"    → cancels the order with a reason (failed verification)
 *
 * Idempotent at the request level (Idempotency-Key header) AND at the RPC
 * layer (mark_cod_verified no-ops if already verified).
 */
export const POST = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { user, db } = ctx;
    const { id: orderId } = await context.params;

    const idempKey = request.headers.get("Idempotency-Key");
    const cached   = await idempotencyCheck(db, "cod-verify", idempKey);
    if (cached) return apiSuccess(cached);

    const body: unknown = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "Invalid request",
        400,
        "VALIDATION_ERROR",
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const { data: order } = await db
      .from("orders")
      .select("id, order_number, status, cod_verification_required, cod_verified_at")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) throw new NotFoundError("Order not found");

    if (!order.cod_verification_required) {
      throw new OrderStateError(
        "This order doesn't require COD verification (low-value or non-COD)",
      );
    }

    if (parsed.data.action === "verify") {
      const { error: rpcError } = await db.rpc("mark_cod_verified", {
        p_order_id: orderId,
        p_admin_id: user.id,
        p_note:     parsed.data.note ?? undefined,
      });
      if (rpcError) {
        const msg = rpcError.message ?? "Failed to mark COD verified";
        throw new Error(msg);
      }

      await logAdminAction(ctx, request, {
        action:     "cod_verified",
        entityType: "order",
        entityId:   orderId,
        metadata:   { order_number: order.order_number, note: parsed.data.note ?? null },
      });

      const result = { orderId, status: "verified", verifiedAt: new Date().toISOString() };
      await idempotencyStore(db, "cod-verify", idempKey, result);
      return apiSuccess(result);
    }

    // action === "fail"
    const { error: failErr } = await db.rpc("mark_cod_verification_failed", {
      p_order_id: orderId,
      p_admin_id: user.id,
      p_reason:   parsed.data.reason,
    });
    if (failErr) {
      const msg = failErr.message ?? "Failed to mark verification failed";
      throw new Error(msg);
    }

    await logAdminAction(ctx, request, {
      action:     "cod_verification_failed",
      entityType: "order",
      entityId:   orderId,
      metadata:   { order_number: order.order_number, reason: parsed.data.reason },
    });

    const result = { orderId, status: "verification_failed_cancelled", reason: parsed.data.reason };
    await idempotencyStore(db, "cod-verify", idempKey, result);
    return apiSuccess(result);
  },
);
