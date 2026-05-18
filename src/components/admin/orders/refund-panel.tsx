"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/utils";

interface OrderItem {
  id: string;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
}

interface AdminRefundPanelProps {
  orderId: string;
  orderStatus: string;
  paymentProvider: string;
  items: OrderItem[];
  orderShipping: number;
}

const REFUNDABLE_STATUSES = [
  "delivered", "return_requested", "return_approved", "return_in_transit",
  "returned", "cancelled", "partially_returned", "partially_refunded",
  "received",
];

export function AdminRefundPanel({
  orderId,
  orderStatus,
  paymentProvider,
  items,
  orderShipping,
}: AdminRefundPanelProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [refundShipping, setRefundShipping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ refundId: string; amount: number; refundType: string } | null>(null);

  const canRefund = REFUNDABLE_STATUSES.includes(orderStatus);

  if (!canRefund) return null;

  // Calculate preview total
  const previewTotal =
    items.reduce((sum, item) => {
      const qty = selectedItems[item.id] ?? 0;
      return sum + qty * item.unit_price;
    }, 0) + (refundShipping ? orderShipping : 0);

  const hasSelections = Object.values(selectedItems).some((q) => q > 0);

  function setItemQty(itemId: string, qty: number) {
    setSelectedItems((prev) => {
      if (qty <= 0) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: qty };
    });
  }

  async function handleSubmit() {
    if (!reason.trim() || reason.trim().length < 5) {
      toast.error("Please enter a reason (at least 5 characters)");
      return;
    }
    if (!hasSelections && !refundShipping) {
      toast.error("Select at least one item or shipping to refund");
      return;
    }

    const refundItems = Object.entries(selectedItems)
      .filter(([, qty]) => qty > 0)
      .map(([order_item_id, quantity]) => ({ order_item_id, quantity }));

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim(),
          refund_items: refundItems,
          refund_shipping: refundShipping,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.message ?? "Refund failed");
      }

      setResult(body.data);
      setIsOpen(false);
      toast.success(`Refund of ${formatPrice(body.data.amount)} processed`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
        <CardContent className="flex items-center gap-3 pt-4 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          <div>
            <p className="font-medium text-green-800 dark:text-green-300">
              Refund processed — {formatPrice(result.amount)}
            </p>
            <p className="text-xs text-green-700 dark:text-green-400">
              Type: {result.refundType} · ID: {result.refundId.slice(0, 8)}…
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RotateCcw className="h-4 w-4" />
          Issue Refund
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {paymentProvider === "cod" && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-amber-800 dark:text-amber-300 text-xs">
              COD order — refund will be recorded in the system. Coordinate cash reimbursement manually.
            </p>
          </div>
        )}

        {!isOpen ? (
          <Button variant="outline" size="sm" className="w-full" onClick={() => setIsOpen(true)}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Process Refund
          </Button>
        ) : (
          <div className="space-y-4">
            {/* Items selection */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
                Select Items to Refund
              </Label>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 rounded border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{item.product_name}</p>
                      {item.variant_name && (
                        <p className="text-xs text-muted-foreground truncate">{item.variant_name}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatPrice(item.unit_price)} × {item.quantity} available
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setItemQty(item.id, (selectedItems[item.id] ?? 0) - 1)}
                        className="flex h-6 w-6 items-center justify-center rounded border text-xs hover:bg-muted"
                        disabled={(selectedItems[item.id] ?? 0) <= 0}
                      >−</button>
                      <span className="w-6 text-center text-sm">{selectedItems[item.id] ?? 0}</span>
                      <button
                        type="button"
                        onClick={() => setItemQty(item.id, (selectedItems[item.id] ?? 0) + 1)}
                        className="flex h-6 w-6 items-center justify-center rounded border text-xs hover:bg-muted"
                        disabled={(selectedItems[item.id] ?? 0) >= item.quantity}
                      >+</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Shipping refund */}
            {orderShipping > 0 && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={refundShipping}
                  onChange={(e) => setRefundShipping(e.target.checked)}
                  className="rounded border"
                />
                <span>Refund shipping ({formatPrice(orderShipping)})</span>
              </label>
            )}

            {/* Reason */}
            <div>
              <Label htmlFor="refund-reason" className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Reason *
              </Label>
              <textarea
                id="refund-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Explain the reason for this refund…"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            {/* Preview total */}
            {(hasSelections || refundShipping) && (
              <>
                <Separator />
                <div className="flex items-center justify-between font-medium">
                  <span>Refund total</span>
                  <span>{formatPrice(previewTotal)}</span>
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting || (!hasSelections && !refundShipping)}
                className="flex-1"
              >
                {isSubmitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {isSubmitting ? "Processing…" : "Confirm Refund"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsOpen(false);
                  setSelectedItems({});
                  setReason("");
                  setRefundShipping(false);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
