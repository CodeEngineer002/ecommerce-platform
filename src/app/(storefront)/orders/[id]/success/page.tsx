import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { CodDueBanner } from "@/components/orders/cod-due-banner";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderSuccessPage({ params }: Props) {
  const { id } = await params;

  // Minimal fetch so we can show the COD-due banner on first paint after
  // checkout. Failure here must not break the success page.
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("total, payments(provider, status, currency)")
    .eq("id", id)
    .maybeSingle();

  const payment = Array.isArray(order?.payments) ? order?.payments[0] : null;
  const showCodBanner =
    payment?.provider === "cod" && payment?.status === "cod_pending_collection";
  // Currency lives on payments, not orders. Default to INR for the non-localized
  // route since this page has no country param to derive a regional default.
  const currencyCode = payment?.currency ?? "INR";

  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <div className="mb-6 rounded-full bg-green-100 p-6">
        <CheckCircle2 className="h-16 w-16 text-green-600" />
      </div>
      <h1 className="text-3xl font-bold">Order Placed!</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        Thank you for your purchase. We&apos;ve received your order and will process it shortly.
        You&apos;ll receive a confirmation email soon.
      </p>

      {showCodBanner && order && (
        <div className="mt-6 w-full max-w-md text-left">
          <CodDueBanner
            amount={Number(order.total)}
            currencyCode={currencyCode}
          />
        </div>
      )}

      <div className="mt-8 flex gap-4">
        <Button asChild>
          <Link href={ROUTES.order(id)}>View Order</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={ROUTES.products}>Continue Shopping</Link>
        </Button>
      </div>
    </div>
  );
}
