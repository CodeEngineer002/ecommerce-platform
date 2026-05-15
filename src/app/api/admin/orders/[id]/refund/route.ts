import { z } from "zod";

import { calculateRefund } from "@/domain/order/refund-calculator";
import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { CURRENCY } from "@/lib/constants";
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
        orderTotal:     order.total,
        refundShipping: refund_shipping,
      });
    } catch (err) {
      throw new RefundNotAllowedError(err instanceof Error ? err.message : "Invalid refund request");
    }

    type Payment = { id: string; provider: string; provider_order_id?: string };
    const payment = Array.isArray(order.payment)
      ? (order.payment[0] as Payment | undefined)
      : (order.payment as Payment | null);

    if (!payment) throw new RefundNotAllowedError("No payment found for this order");

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

    return apiSuccess({
      refundId,
      amount:     calculation.totalRefund,
      refundType: calculation.refundType,
      currency:   CURRENCY,
    });
  },
);
