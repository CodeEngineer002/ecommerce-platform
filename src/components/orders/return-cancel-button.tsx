"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { useCancelReturnRequest } from "@/features/orders/hooks/use-orders";
import { Button } from "@/components/ui/button";

interface Props {
  orderId:     string;
  requestId:   string;
  requestType: string;
}

export function ReturnCancelButton({ orderId, requestId, requestType }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const { mutateAsync: cancelRequest, isPending } = useCancelReturnRequest();

  const label = requestType === "replacement" ? "replacement" : "return";

  if (!confirming) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-muted-foreground hover:border-red-300 hover:text-red-600"
        onClick={() => setConfirming(true)}
      >
        <X className="h-3.5 w-3.5" />
        Cancel request
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30 space-y-2">
      <p className="text-sm font-medium text-red-700 dark:text-red-300">
        Cancel this {label} request?
      </p>
      <p className="text-xs text-red-600 dark:text-red-400">
        This cannot be undone. You can submit a new request after cancellation.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="text-xs"
        >
          Keep request
        </Button>
        <Button
          size="sm"
          className="gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs"
          disabled={isPending}
          onClick={async () => {
            await cancelRequest({ orderId, requestId });
            router.refresh();
          }}
        >
          {isPending ? "Cancelling…" : `Yes, cancel ${label}`}
        </Button>
      </div>
    </div>
  );
}
