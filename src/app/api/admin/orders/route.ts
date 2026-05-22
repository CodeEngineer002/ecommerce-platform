import { type NextRequest } from "next/server";

import { apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { requireAdminPermission } from "@/lib/admin/with-admin-permission";
import type { Database } from "@/types/database.types";

type DbOrderStatus = Database["public"]["Enums"]["order_status"];

/**
 * GET /api/admin/orders
 *
 * Paginated + filtered orders list for the admin panel.
 * Enforces ORDERS_READ permission via requireAdminPermission (RBAC).
 *
 * Query params:
 *   page    — 1-indexed page number (default: 1)
 *   limit   — page size (default: 20, max: 100)
 *   q       — order_number search (ilike)
 *   status  — filter by order status
 *   sort    — created_at | total | order_number (default: created_at)
 *   dir     — asc | desc (default: desc)
 */
export const GET = withApiHandler(async (request: NextRequest) => {
  const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_READ);

  const { searchParams } = request.nextUrl;
  const page    = Math.max(1, parseInt(searchParams.get("page")  ?? "1",  10));
  const limit   = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const search  = searchParams.get("q")?.trim()      ?? "";
  const status  = searchParams.get("status")?.trim() ?? "";
  const sortBy  = (searchParams.get("sort")  ?? "created_at") as "created_at" | "total" | "order_number";
  const sortDir = (searchParams.get("dir")   ?? "desc")        as "asc" | "desc";
  const from    = (page - 1) * limit;

  const validSortCols: ReadonlyArray<string> = ["created_at", "total", "order_number"];
  const safeSortBy = validSortCols.includes(sortBy) ? sortBy : "created_at";

  let query = db
    .from("orders")
    .select(
      `*,
      items:order_items(*),
      payment:payments(*)`,
      { count: "exact" },
    );

  if (search) {
    query = query.ilike("order_number", `%${search}%`);
  }
  if (status) {
    query = query.eq("status", status as DbOrderStatus);
  }

  const { data, count, error } = await query
    .order(safeSortBy, { ascending: sortDir === "asc" })
    .range(from, from + limit - 1);

  if (error) throw error;

  return apiSuccess({
    data:       data ?? [],
    count:      count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
});
