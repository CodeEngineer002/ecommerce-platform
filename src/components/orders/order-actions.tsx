"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useCancelOrder } from "@/features/orders/hooks/use-orders";
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
import { ROUTES } from "@/lib/constants";

interface Props {
  orderId:    string;
  canCancel:  boolean;
  canReturn:  boolean;
  returnHref?: string; // optional override — locale pages pass their own prefixed URL
}

export function OrderActions({ orderId, canCancel, canReturn, returnHref }: Props) {
  const router = useRouter();
  const { mutateAsync: cancelOrder, isPending: cancelling } = useCancelOrder();

  const [cancelOpen,   setCancelOpen]   = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  async function handleCancel() {
    try {
      await cancelOrder({ orderId, reason: cancelReason || undefined });
      setCancelOpen(false);
      router.refresh();
    } catch {
      // error toast handled by the hook
    }
  }

  if (!canCancel && !canReturn) return null;

  return (
    <>
      <div className="flex gap-2">
        {canReturn && (
          <Button variant="outline" size="sm" asChild>
            <Link href={returnHref ?? ROUTES.orderReturn(orderId)}>Request Return</Link>
          </Button>
        )}
        {canCancel && (
          <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
            Cancel Order
          </Button>
        )}
      </div>

      {/* Cancel confirmation dialog */}
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
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Keep Order
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
