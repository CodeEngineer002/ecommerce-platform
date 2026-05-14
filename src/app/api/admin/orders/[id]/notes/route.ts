import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { AuthError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const createNoteSchema = z.object({
  content:     z.string().min(1).max(2000),
  is_internal: z.boolean().default(true),
});

// GET /api/admin/orders/[id]/notes
export const GET = withApiHandler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) throw new AuthError();

    const db = createServiceClient();

    const { data: profile } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      throw new ForbiddenError();
    }

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
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) throw new AuthError();

    const db = createServiceClient();

    const { data: profile } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      throw new ForbiddenError();
    }

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

    return apiSuccess(note, 201);
  },
);
