import "server-only";
import { z } from "zod";

import { apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { requireAdminPermission } from "@/lib/admin/with-admin-permission";

const resolveSchema = z.object({
  resolution_note: z.string().max(500).optional(),
});

// GET /api/admin/order-exceptions — list open exceptions
export const GET = withApiHandler(async (request: Request) => {
  const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_READ);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "open";

  const { data, error } = await db
    .from("order_exceptions")
    .select(
      "id, order_id, exception_type, status, detected_at, resolved_at, resolution_note, metadata, orders(order_number, status)",
    )
    .eq("status", status)
    .order("detected_at", { ascending: false })
    .limit(200);

  if (error) throw new Error("Failed to fetch order exceptions");

  return apiSuccess(data ?? []);
});

// PATCH /api/admin/order-exceptions/[id] — resolve an exception
// (handled in the [id] sub-route, see ./[id]/route.ts)
