import { ArrowLeft, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ReturnForm } from "@/components/orders/return-form";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkReturnEligibility, RETURN_WINDOW_DAYS } from "@/domain/returns/return-eligibility";
import { ROUTES } from "@/lib/constants";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderReturnPage({ params }: Props) {
  const { id } = await params;

  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) redirect(ROUTES.login);

  const db = createServiceClient();

  // Fetch order with items
  const { data: order } = await db
    .from("orders")
    .select(
      `
      id,
      order_number,
      status,
      user_id,
      created_at,
      items:order_items (
        id,
        product_name,
        variant_name,
        quantity,
        unit_price,
        total
      )
    `,
    )
    .eq("id", id)
    .single();

  if (!order || order.user_id !== user.id) notFound();

  // Check return eligibility (30-day window + delivered status)
  const eligibility = await checkReturnEligibility(id, user.id);

  // Check for active return already in progress
  const { data: existingReturns } = await db
    .from("order_returns")
    .select("id, status")
    .eq("order_id", id)
    .in("status", ["requested", "approved", "pickup_scheduled", "in_transit"]);

  const hasActiveReturn = (existingReturns ?? []).length > 0;

  type OrderItem = {
    id: string;
    product_name: string;
    variant_name: string | null;
    quantity: number;
    unit_price: number;
    total: number;
  };

  const items = (order.items ?? []) as unknown as OrderItem[];

  return (
    <div className="container max-w-2xl py-8">
      <Button variant="ghost" size="sm" asChild className="mb-6 gap-2">
        <Link href={ROUTES.order(id)}>
          <ArrowLeft className="h-4 w-4" /> Back to Order
        </Link>
      </Button>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Request Return</h1>
          <p className="text-sm text-muted-foreground">
            Order #{order.order_number} &middot; {formatDate(order.created_at)}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Return window info */}
      {eligibility.windowExpiresAt && (
        <Card className="mb-6 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
          <CardContent className="flex items-center gap-3 py-4 text-sm">
            <Clock className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <p>
              {RETURN_WINDOW_DAYS}-day return window expires on{" "}
              <span className="font-medium">
                {eligibility.windowExpiresAt.toLocaleDateString("en-IN", {
                  day:   "numeric",
                  month: "long",
                  year:  "numeric",
                })}
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Not eligible state */}
      {!eligibility.eligible || hasActiveReturn ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <XCircle className="h-4 w-4" />
              Return not available
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            {hasActiveReturn ? (
              <p>You already have a return request in progress for this order.</p>
            ) : (
              <p>{eligibility.reason}</p>
            )}
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href={ROUTES.order(id)}>Back to order</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ReturnForm orderId={id} orderItems={items} />
      )}
    </div>
  );
}
