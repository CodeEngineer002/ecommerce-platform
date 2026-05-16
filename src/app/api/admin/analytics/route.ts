import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { requireAdminPermission } from "@/lib/admin/with-admin-permission";

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to:   z.string().datetime().optional(),
});

/**
 * GET /api/admin/analytics
 * Returns analytics data for the admin dashboard.
 * Optional query params: from, to (ISO datetime strings)
 *
 * Response:
 *   - revenueByDay:    { date: string; revenue: number }[]
 *   - topProducts:     { product_name: string; units_sold: number; revenue: number }[]
 *   - conversionRate:  { carts: number; orders: number; rate: number }
 *   - summary:         { totalRevenue; totalOrders; avgOrderValue }
 */
export const GET = withApiHandler(
  async (request: Request) => {
    const { db } = await requireAdminPermission(PERMISSIONS.ANALYTICS_READ);

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      from: url.searchParams.get("from") ?? undefined,
      to:   url.searchParams.get("to") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("Invalid date range", 400, "VALIDATION_ERROR");
    }

    // Default: last 30 days
    const toDate   = parsed.data.to   ? new Date(parsed.data.to)   : new Date();
    const fromDate = parsed.data.from ? new Date(parsed.data.from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const fromISO = fromDate.toISOString();
    const toISO   = toDate.toISOString();

    // ── Parallel queries ──────────────────────────────────────────────────────
    const [
      revenueResult,
      ordersWithItemsResult,
      cartsResult,
      ordersCountResult,
    ] = await Promise.all([

      // Revenue bucketed by day (all non-draft/failed orders in range)
      db
        .from("orders")
        .select("created_at, total")
        .not("status", "in", '("draft","failed","cancelled")')
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .order("created_at", { ascending: true }),

      // Orders with items to compute top products (in range)
      db
        .from("orders")
        .select("id, items:order_items(product_name, quantity, total)")
        .not("status", "in", '("draft","failed","cancelled")')
        .gte("created_at", fromISO)
        .lte("created_at", toISO),

      // Cart count (created in range)
      db
        .from("carts")
        .select("*", { count: "exact", head: true })
        .gte("created_at", fromISO)
        .lte("created_at", toISO),

      // Orders count (created in range, non-draft/failed)
      db
        .from("orders")
        .select("*", { count: "exact", head: true })
        .not("status", "in", '("draft","failed")')
        .gte("created_at", fromISO)
        .lte("created_at", toISO),
    ]);

    // ── Revenue by day ────────────────────────────────────────────────────────
    const dayMap: Record<string, number> = {};
    for (const order of revenueResult.data ?? []) {
      const day = order.created_at.slice(0, 10); // YYYY-MM-DD
      dayMap[day] = (dayMap[day] ?? 0) + order.total;
    }
    // Fill missing days with 0 for a continuous line
    const revenueByDay: { date: string; revenue: number }[] = [];
    const cursor = new Date(fromDate);
    while (cursor <= toDate) {
      const key = cursor.toISOString().slice(0, 10);
      revenueByDay.push({ date: key, revenue: Math.round((dayMap[key] ?? 0) * 100) / 100 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // ── Top products ──────────────────────────────────────────────────────────
    const productMap: Record<string, { units_sold: number; revenue: number }> = {};
    for (const order of ordersWithItemsResult.data ?? []) {
      const items = (order as unknown as { items: Array<{ product_name: string; quantity: number; total: number }> }).items ?? [];
      for (const item of items) {
        const key = item.product_name;
        if (!productMap[key]) productMap[key] = { units_sold: 0, revenue: 0 };
        productMap[key].units_sold += item.quantity;
        productMap[key].revenue    += item.total;
      }
    }
    const topProducts = Object.entries(productMap)
      .map(([product_name, v]) => ({ product_name, ...v }))
      .sort((a, b) => b.units_sold - a.units_sold)
      .slice(0, 5);

    // ── Conversion rate ────────────────────────────────────────────────────────
    const cartCount  = cartsResult.count ?? 0;
    const orderCount = ordersCountResult.count ?? 0;
    const conversionRate = cartCount > 0 ? Math.round((orderCount / cartCount) * 10000) / 100 : 0;

    // ── Summary ────────────────────────────────────────────────────────────────
    const totalRevenue = revenueByDay.reduce((s, d) => s + d.revenue, 0);
    const avgOrderValue = orderCount > 0 ? Math.round((totalRevenue / orderCount) * 100) / 100 : 0;

    return apiSuccess({
      revenueByDay,
      topProducts,
      conversionRate: { carts: cartCount, orders: orderCount, rate: conversionRate },
      summary: {
        totalRevenue:  Math.round(totalRevenue * 100) / 100,
        totalOrders:   orderCount,
        avgOrderValue,
      },
      dateRange: { from: fromISO, to: toISO },
    });
  },
);
