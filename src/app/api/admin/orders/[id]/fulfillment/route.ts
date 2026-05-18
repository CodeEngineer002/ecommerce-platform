import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { FulfillmentError, NotFoundError } from "@/lib/errors";

const createFulfillmentSchema = z.object({
  carrier:             z.string().max(100).optional(),
  tracking_number:     z.string().max(200).optional(),
  tracking_url:        z.string().url().max(500).optional(),
  estimated_delivery:  z.string().datetime().optional(),
  notes:               z.string().max(500).optional(),
  shipment_type:       z.enum([
    "outbound_original",
    "return_pickup",
    "replacement_outbound",
    "exchange_pickup",
    "return_to_origin",
  ]).optional(),
  request_id:          z.string().uuid().optional(),
});

const updateFulfillmentSchema = z.object({
  fulfillment_id:     z.string().uuid(),
  carrier:            z.string().max(100).optional(),
  tracking_number:    z.string().max(200).optional(),
  tracking_url:       z.string().url().max(500).optional(),
  status:             z.enum(["processing", "packed", "shipped", "out_for_delivery", "delivered", "failed"]).optional(),
  estimated_delivery: z.string().datetime().optional(),
});

// POST /api/admin/orders/[id]/fulfillment — create fulfillment
export const POST = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { user, db } = ctx;

    const { id: orderId } = await context.params;

    const body: unknown = await request.json();
    const parsed = createFulfillmentSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "Invalid request",
        400,
        "VALIDATION_ERROR",
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const { carrier, tracking_number, tracking_url, estimated_delivery, notes, shipment_type, request_id } = parsed.data;

    const { data: fulfillmentId, error } = await db.rpc("create_fulfillment", {
      p_order_id:           orderId,
      p_admin_id:           user.id,
      p_carrier:            carrier ?? undefined,
      p_tracking_number:    tracking_number ?? undefined,
      p_tracking_url:       tracking_url ?? undefined,
      p_estimated_delivery: estimated_delivery ?? undefined,
      p_notes:              notes ?? undefined,
      p_shipment_type:      shipment_type ?? "outbound_original",
      p_request_id:         request_id ?? undefined,
    });

    if (error) {
      const msg = error.message ?? "";
      if (error.code === "P0005" || msg.includes("not found")) {
        throw new NotFoundError("Order not found");
      }
      if (error.code === "P0006" || msg.includes("must be confirmed")) {
        throw new FulfillmentError(msg || "Order is not in a fulfillable state");
      }
      throw new Error(msg || "Failed to create fulfillment");
    }

    await logAdminAction(ctx, request, {
      action: "create_fulfillment",
      entityType: "order",
      entityId: orderId,
      metadata: { fulfillmentId, carrier, tracking_number },
    });

    return apiSuccess({ fulfillmentId }, 201);
  },
);

// PATCH /api/admin/orders/[id]/fulfillment — update tracking
export const PATCH = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { user, db } = ctx;

    const body: unknown = await request.json();
    const parsed = updateFulfillmentSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "Invalid request",
        400,
        "VALIDATION_ERROR",
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const {
      fulfillment_id,
      carrier,
      tracking_number,
      tracking_url,
      status,
      estimated_delivery,
    } = parsed.data;

    const { error } = await db.rpc("update_fulfillment_tracking", {
      p_fulfillment_id:     fulfillment_id,
      p_admin_id:           user.id,
      p_carrier:            carrier ?? undefined,
      p_tracking_number:    tracking_number ?? undefined,
      p_tracking_url:       tracking_url ?? undefined,
      p_status:             status ?? undefined,
      p_estimated_delivery: estimated_delivery ?? undefined,
    });

    if (error) {
      const msg = error.message ?? "";
      if (error.code === "P0005" || msg.includes("not found")) {
        throw new NotFoundError("Fulfillment not found");
      }
      throw new Error(msg || "Failed to update fulfillment");
    }

    await logAdminAction(ctx, request, {
      action: "update_fulfillment",
      entityType: "fulfillment",
      entityId: fulfillment_id,
      metadata: { carrier, tracking_number, status },
    });

    return apiSuccess({ success: true });
  },
);

// GET /api/admin/orders/[id]/fulfillment — list fulfillments for order
export const GET = withApiHandler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_READ);

    const { id: orderId } = await context.params;

    const { data, error } = await db
      .from("order_fulfillments")
      .select("*, items:fulfillment_items(*)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (error) throw new Error("Failed to fetch fulfillments");

    return apiSuccess(data ?? []);
  },
);
