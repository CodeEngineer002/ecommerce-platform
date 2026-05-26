import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { idempotencyCheck, idempotencyStore } from "@/lib/api/idempotency";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { NotFoundError } from "@/lib/errors";

const schema = z.object({
  payout_method: z.enum(["upi", "bank_transfer", "cash", "store_credit"]),
  reference:     z.string().max(120).optional(),
});

/**
 * POST /api/admin/refunds/[id]/payout
 *
 * Records that a pending COD refund has been physically paid out. Captures:
 *   - method  (upi | bank_transfer | cash | store_credit)
 *   - reference (UPI txn id, bank ref, cash voucher number)
 *
 * Flips the refund row to status='succeeded' and stamps payout_completed_at.
 *
 * Idempotent at request-level (Idempotency-Key) AND at RPC layer
 * (mark_cod_refund_paid no-ops if already completed).
 */
export const POST = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { user, db } = ctx;
    const { id: refundId } = await context.params;

    const idempKey = request.headers.get("Idempotency-Key");
    const cached   = await idempotencyCheck(db, "refund-payout", idempKey);
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

    const { data: refund } = await db
      .from("refunds")
      .select("id, status, amount, order_id")
      .eq("id", refundId)
      .maybeSingle();
    if (!refund) throw new NotFoundError("Refund not found");

    const { error: rpcError } = await db.rpc("mark_cod_refund_paid", {
      p_refund_id:     refundId,
      p_admin_id:      user.id,
      p_payout_method: parsed.data.payout_method,
      p_reference:     parsed.data.reference ?? undefined,
    });
    if (rpcError) {
      throw new Error(rpcError.message ?? "Failed to record payout");
    }

    await logAdminAction(ctx, request, {
      action:     "cod_refund_payout",
      entityType: "refund",
      entityId:   refundId,
      metadata:   {
        order_id:      refund.order_id,
        amount:        refund.amount,
        payout_method: parsed.data.payout_method,
        reference:     parsed.data.reference ?? null,
      },
    });

    const result = {
      refundId,
      status:        "succeeded",
      payoutMethod:  parsed.data.payout_method,
      completedAt:   new Date().toISOString(),
    };
    await idempotencyStore(db, "refund-payout", idempKey, result);
    return apiSuccess(result);
  },
);
