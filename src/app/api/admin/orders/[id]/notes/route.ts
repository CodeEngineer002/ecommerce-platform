import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { NotFoundError } from "@/lib/errors";

const createNoteSchema = z.object({
  content:     z.string().min(1).max(2000),
  is_internal: z.boolean().default(true),
});

// GET /api/admin/orders/[id]/notes
export const GET = withApiHandler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_READ);

    const { id: orderId } = await context.params;

    const { data: notes, error } = await db
      .from("admin_order_notes")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (error) throw new Error("Failed to fetch notes");

    return apiSuccess(notes ?? []);
  },
);

// POST /api/admin/orders/[id]/notes
export const POST = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { user, db } = ctx;

    const { id: orderId } = await context.params;

    const body: unknown = await request.json();
    const parsed = createNoteSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "Invalid request",
        400,
        "VALIDATION_ERROR",
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    // Verify order exists
    const { data: order } = await db
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .single();

    if (!order) throw new NotFoundError("Order not found");

    const { data: note, error } = await db
      .from("admin_order_notes")
      .insert({
        order_id:    orderId,
        author_id:   user.id,
        content:     parsed.data.content,
        is_internal: parsed.data.is_internal,
      })
      .select()
      .single();

    if (error || !note) throw new Error("Failed to create note");

    // Log event for non-internal notes (visible to customer)
    if (!parsed.data.is_internal) {
      await db.from("order_events").insert({
        order_id:    orderId,
        event_type:  "note_added",
        actor_id:    user.id,
        actor_type:  "admin",
        description: "A note was added to your order",
        metadata:    { note_id: note.id },
      });
    }

    await logAdminAction(ctx, request, {
      action: "add_order_note",
      entityType: "order",
      entityId: orderId,
      metadata: { noteId: note.id, isInternal: parsed.data.is_internal },
    });

    return apiSuccess(note, 201);
  },
);
