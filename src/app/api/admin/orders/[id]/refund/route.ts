import { z } from "zod";

import { calculateRefund } from "@/domain/order/refund-calculator";
import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { idempotencyCheck, idempotencyStore } from "@/lib/api/idempotency";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { CURRENCY } from "@/lib/constants";
import { sendRefundProcessedEmail } from "@/lib/email";
import { NotFoundError, RefundNotAllowedError } from "@/lib/errors";
import { getPaymentProvider } from "@/lib/payment";

const refundItemSchema = z.object({
  order_item_id: z.string().uuid(),
  quantity:      z.number().int().min(1),
});

const schema = z.object({
  reason:          z.string().min(5).max(500),
  refund_items:    z.array(refundItemSchema).min(1).max(50),
  refund_shipping: z.boolean().default(false),
  return_id:       z.string().uuid().optional(),
});

// POST /api/admin/orders/[id]/refund
export const POST = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { user, db } = ctx;

    const { id: orderId } = await context.params;

    // Phase 3.2 — idempotency: refund is money-flowing; a duplicate request
    // could call the gateway twice. The gateway has its own protection but
    // request-level cache prevents the second gateway hit entirely.
    const idempKey = request.headers.get("Idempotency-Key");
    const cached   = await idempotencyCheck(db, "refund", idempKey);
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
    const { reason, refund_items, refund_shipping, return_id } = parsed.data;

    // Fetch order with items and payment
    const { data: order } = await db
      .from("orders")
      .select("*, items:order_items(*), payment:payments(*)")
      .eq("id", orderId)
      .single();

    if (!order) throw new NotFoundError("Order not found");

    const refundableStatuses = [
      "delivered", "return_requested", "return_approved", "return_in_transit",
      "returned", "cancelled", "partially_returned", "partially_refunded",
    ];

    if (!refundableStatuses.includes(order.status)) {
      throw new RefundNotAllowedError(
        `Order cannot be refunded from status: ${order.status}`,
      );
    }

    // Fetch already-refunded quantities per item (from succeeded refunds)
    const { data: succeededRefunds } = await db
      .from("refunds")
      .select("id")
      .eq("order_id", orderId)
      .eq("status", "succeeded");

    const succeededIds = (succeededRefunds ?? []).map((r) => r.id);

    const existingRefundItems =
      succeededIds.length > 0
        ? (
            await db
              .from("refund_items")
              .select("order_item_id, quantity")
              .in("refund_id", succeededIds)
          ).data ?? []
        : [];

    const returnedQtyMap = new Map<string, number>();
    for (const ri of existingRefundItems) {
      returnedQtyMap.set(
        ri.order_item_id,
        (returnedQtyMap.get(ri.order_item_id) ?? 0) + ri.quantity,
      );
    }

    type OrderItem = { id: string; quantity: number; unit_price: number };
    const items = (order.items as OrderItem[]).map((i) => ({
      orderItemId:      i.id,
      quantity:         i.quantity,
      unitPrice:        i.unit_price,
      returnedQuantity: returnedQtyMap.get(i.id) ?? 0,
    }));

    let calculation;
    try {
      calculation = calculateRefund({
        items,
        refundItems: refund_items.map((ri) => ({
          orderItemId: ri.order_item_id,
          quantity:    ri.quantity,
        })),
        orderSubtotal:  order.subtotal,
        orderShipping:  order.shipping,
        orderTax:       order.tax,
        orderDiscount:  Number(order.discount ?? 0),
        orderTotal:     order.total,
        refundShipping: refund_shipping,
      });
    } catch (err) {
      throw new RefundNotAllowedError(err instanceof Error ? err.message : "Invalid refund request");
    }

    type Payment = { id: string; provider: string; status: string; provider_order_id?: string };
    const payment = Array.isArray(order.payment)
      ? (order.payment[0] as Payment | undefined)
      : (order.payment as Payment | null);

    if (!payment) throw new RefundNotAllowedError("No payment found for this order");

    // Phase 1.4 guard: a COD order whose cash was never collected has no money
    // to refund. The correct admin action is to cancel the order, which releases
    // inventory and marks payment cancelled — not to "refund" zero.
    if (payment.provider === "cod" && payment.status !== "succeeded") {
      throw new RefundNotAllowedError(
        "Cannot refund a COD order with no successful cash collection. " +
        "Cancel the order instead.",
      );
    }

    // Call payment gateway (skip for COD)
    if (payment.provider !== "cod") {
      const provider = getPaymentProvider(payment.provider as "stripe" | "razorpay");
      const succeeded = await provider.refund(
        payment.provider_order_id ?? payment.id,
        // Convert to smallest currency unit expected by provider
        Math.round(calculation.totalRefund * 100),
      );
      if (!succeeded) {
        throw new RefundNotAllowedError("Payment gateway rejected the refund");
      }
    }

    // Record in DB atomically
    const { data: refundId, error: rpcError } = await db.rpc("record_refund", {
      p_order_id:           orderId,
      p_payment_id:         payment.id,
      p_amount:             calculation.totalRefund,
      p_refund_type:        calculation.refundType,
      p_admin_id:           user.id,
      p_reason:             reason,
      p_return_id:          return_id ?? undefined,
      p_provider_refund_id: undefined,
    });

    if (rpcError || !refundId) {
      throw new Error(rpcError?.message ?? "Failed to record refund");
    }

    // Insert refund line items for audit trail
    if (calculation.lines.length > 0) {
      await db.from("refund_line_items").insert(
        calculation.lines.map((l) => ({
          refund_id:     refundId as string,
          order_item_id: l.orderItemId,
          quantity:      l.quantity,
          amount:        l.lineTotal,
        })),
      );
    }

    await logAdminAction(ctx, request, {
      action: "process_refund",
      entityType: "order",
      entityId: orderId,
      metadata: {
        refundId,
        amount: calculation.totalRefund,
        refundType: calculation.refundType,
        reason,
        returnId: return_id ?? null,
      },
    });

    // ── Fire-and-forget refund email ──────────────────────────────────────────
    void (async () => {
      try {
        const { data: order } = await db
          .from("orders")
          .select("order_number, user_id")
          .eq("id", orderId)
          .single();

        if (!order?.user_id) return;

        const { data: profile } = await db
          .from("profiles")
          .select("full_name, email")
          .eq("id", order.user_id)
          .maybeSingle();

        const toEmail = profile?.email ?? "";
        if (!toEmail) return;

        await sendRefundProcessedEmail({
          to: toEmail,
          customerName: profile?.full_name ?? toEmail,
          orderId,
          orderNumber: order.order_number,
          refundAmount: calculation.totalRefund,
          currencyCode: CURRENCY,
          refundType: calculation.refundType,
          reason,
        });
      } catch (emailErr) {
        console.error("[admin/orders/refund] email failed:", emailErr);
      }
    })();

    const result = {
      refundId,
      amount:     calculation.totalRefund,
      refundType: calculation.refundType,
      currency:   CURRENCY,
    };
    await idempotencyStore(db, "refund", idempKey, result);
    return apiSuccess(result);
  },
);
