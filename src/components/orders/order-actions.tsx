"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";

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
      // Keep dialog open so user can retry or close manually
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

      {/* Cancel confirmation dialog — blocked from closing while in progress */}
      <Dialog
        open={cancelOpen}
        onOpenChange={(open) => {
          if (cancelling) return; // prevent close during processing
          setCancelOpen(open);
        }}
      >
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
              disabled={cancelling}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={cancelling}
            >
              Keep Order
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? "Cancelling…" : "Cancel Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full-screen overlay — shown while cancellation is processing */}
      {cancelling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-5 rounded-2xl border bg-background p-10 shadow-2xl">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <span className="absolute inset-0 animate-spin rounded-full border-4 border-destructive/20 border-t-destructive" />
              <XCircle className="h-9 w-9 text-destructive" />
            </div>
            <div className="space-y-1.5 text-center">
              <p className="text-lg font-semibold">Cancelling your order…</p>
              <p className="text-sm text-muted-foreground">
                Please wait. Don&apos;t close this page.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-2 w-2 animate-bounce rounded-full bg-destructive"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
