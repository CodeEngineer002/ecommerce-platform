"use client";

import { useState } from "react";

import { cancelOrder, createReturnRequest, type ReturnItem } from "@/features/orders/services/order.service";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

interface OrderItem {
  id:           string;
  product_name: string;
  quantity:     number;
  unit_price:   number;
}

interface Props {
  orderId:    string;
  canCancel:  boolean;
  canReturn:  boolean;
  orderItems: OrderItem[];
}

export function OrderActions({ orderId, canCancel, canReturn, orderItems }: Props) {
  const router = useRouter();

  const [cancelOpen,  setCancelOpen]  = useState(false);
  const [returnOpen,  setReturnOpen]  = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [returnQtys, setReturnQtys]   = useState<Record<string, number>>({});
  const [submitting, setSubmitting]   = useState(false);

  async function handleCancel() {
    setSubmitting(true);
    try {
      await cancelOrder(orderId, cancelReason || undefined);
      toast.success("Order cancelled successfully");
      setCancelOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to cancel order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReturn() {
    const items: ReturnItem[] = Object.entries(returnQtys)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => ({ order_item_id: itemId, quantity: qty }));

    if (items.length === 0) {
      toast.error("Select at least one item to return");
      return;
    }
    if (!returnReason.trim()) {
      toast.error("Please provide a reason for the return");
      return;
    }

    setSubmitting(true);
    try {
      await createReturnRequest(orderId, returnReason, items);
      toast.success("Return request submitted");
      setReturnOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit return request");
    } finally {
      setSubmitting(false);
    }
  }

  if (!canCancel && !canReturn) return null;

  return (
    <>
      <div className="flex gap-2">
        {canReturn && (
          <Button variant="outline" size="sm" onClick={() => setReturnOpen(true)}>
            Request Return
          </Button>
        )}
        {canCancel && (
          <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
            Cancel Order
          </Button>
        )}
      </div>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The order will be cancelled and inventory released.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="cancel-reason">Reason (optional)</Label>
            <textarea
              id="cancel-reason"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              rows={3}
              maxLength={500}
              placeholder="Tell us why you want to cancel..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={submitting}>
              Keep Order
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={submitting}>
              {submitting ? "Cancelling…" : "Cancel Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return dialog */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request Return</DialogTitle>
            <DialogDescription>
              Select the items you want to return and provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              {orderItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex-1 truncate">{item.product_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Qty:</span>
                    <select
                      className="rounded border bg-background px-2 py-1 text-sm"
                      value={returnQtys[item.id] ?? 0}
                      onChange={(e) =>
                        setReturnQtys((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))
                      }
                    >
                      {Array.from({ length: item.quantity + 1 }, (_, i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <Label htmlFor="return-reason">Reason for return</Label>
              <textarea
                id="return-reason"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                rows={3}
                maxLength={500}
                placeholder="Describe why you want to return these items..."
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleReturn} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Return"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
