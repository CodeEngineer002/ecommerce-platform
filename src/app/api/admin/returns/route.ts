import { apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { requireAdminPermission } from "@/lib/admin/with-admin-permission";

// GET /api/admin/returns?status=requested  — list all return/replacement requests
export const GET = withApiHandler(
  async (request: Request) => {
    const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_READ);

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");

    let query = db
      .from("order_returns")
      .select(`
        id,
        order_id,
        request_type,
        reason,
        status,
        created_at,
        reviewed_at,
        review_note,
        order:orders(order_number),
        items:order_return_items(
          id,
          order_item_id,
          quantity,
          reason,
          condition,
          order_item:order_items(product_name, variant_name)
        )
      `)
      .order("created_at", { ascending: false });

    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "closed") {
        query = query.in("status", ["refunded", "replaced", "closed", "rejected_after_inspection", "accepted"]);
      } else {
        query = query.eq("status", statusFilter);
      }
    }

    const { data, error } = await query;
    if (error) throw new Error("Failed to fetch return requests");

    return apiSuccess(data ?? []);
  },
);
