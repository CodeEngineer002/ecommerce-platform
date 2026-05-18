import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { NotFoundError } from "@/lib/errors";

/**
 * GET /api/admin/returns/[id]/inventory-check
 *
 * Returns per-item stock availability for a replacement request.
 * Used by admin UI before approving to warn about OOS items.
 *
 * Response shape:
 * {
 *   all_available: boolean,
 *   items: [
 *     { variant_id, product_name, variant_name, requested_qty, available_qty, is_available }
 *   ]
 * }
 */
export const GET = withApiHandler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_READ);
    const { id: returnId } = await context.params;

    // Verify the return request exists and is a replacement request
    const { data: ret, error: retError } = await db
      .from("order_returns")
      .select("id, request_type, status")
      .eq("id", returnId)
      .single();

    if (retError || !ret) throw new NotFoundError("Return request not found");

    if (ret.request_type !== "replacement") {
      return apiError(
        "Inventory check is only applicable to replacement requests",
        400,
        "INVALID_REQUEST_TYPE",
      );
    }

    if (ret.status !== "requested") {
      return apiError(
        "Return request is not in a pending state",
        400,
        "INVALID_STATE",
      );
    }

    const { data, error } = await db.rpc("check_replacement_inventory", {
      p_return_id: returnId,
    });

    if (error) {
      throw new Error(error.message || "Failed to check replacement inventory");
    }

    type InventoryCheckResult = {
      all_available: boolean;
      items: {
        variant_id:    string;
        product_name:  string;
        variant_name:  string | null;
        requested_qty: number;
        available_qty: number | null;
        is_available:  boolean;
      }[];
    };
    return apiSuccess(data as unknown as InventoryCheckResult);
  },
);
