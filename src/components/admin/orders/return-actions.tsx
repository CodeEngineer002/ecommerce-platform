"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PackageX,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

interface InventoryItem {
  variant_id:    string | null;
  product_name:  string;
  variant_name:  string | null;
  requested_qty: number;
  available_qty: number | null;
  is_available:  boolean;
}

interface InventoryCheck {
  all_available: boolean;
  items:         InventoryItem[];
}

interface Props {
  returnId:    string;
  requestType: string;
}

export function AdminReturnActions({ returnId, requestType }: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  // Inventory state — only relevant for replacement requests
  const [inventory, setInventory]       = useState<InventoryCheck | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  const label = requestType === "replacement" ? "replacement" : "return";

  // Fetch inventory when this is a replacement request
  useEffect(() => {
    if (requestType !== "replacement") return;

    setInventoryLoading(true);
    apiFetch<InventoryCheck>(`/api/admin/returns/${returnId}/inventory-check`)
      .then((result) => setInventory(result.data))
      .catch(() => {
        // Non-critical — if check fails we still allow approval
        setInventory(null);
      })
      .finally(() => setInventoryLoading(false));
  }, [returnId, requestType]);

  async function handleAction(action: "approve" | "approve_forced" | "reject") {
    if (action === "reject" && !note.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }

    startTransition(async () => {
      try {
        await apiFetch(`/api/admin/returns/${returnId}`, {
          method: "PATCH",
          body: JSON.stringify({ action, note: note.trim() || undefined }),
        });

        const successMsg =
          action === "reject"
            ? `${label.charAt(0).toUpperCase() + label.slice(1)} request rejected`
            : action === "approve_forced"
            ? "Replacement approved (forced — some items were out of stock)"
            : `${label.charAt(0).toUpperCase() + label.slice(1)} request approved`;

        toast.success(successMsg);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Action failed";
        // Surface OOS error with a specific message
        if (msg.includes("out of stock") || msg.includes("OOS")) {
          toast.error("Cannot approve: one or more items are out of stock. Use 'Force Approve' to override.");
        } else {
          toast.error(msg);
        }
      }
    });
  }

  const hasOOS = inventory && !inventory.all_available;

  return (
    <div className="space-y-4 border-t pt-4">

      {/* ── Inventory check panel (replacement only) ─────────────────────── */}
      {requestType === "replacement" && (
        <div>
          {inventoryLoading ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking stock availability…
            </div>
          ) : inventory ? (
            <div className={`rounded-md border px-3 py-3 space-y-2 text-sm ${
              inventory.all_available
                ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
            }`}>
              <div className="flex items-center gap-2 font-medium">
                {inventory.all_available ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-green-700 dark:text-green-400">All items in stock</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-amber-700 dark:text-amber-400">
                      Some items are out of stock
                    </span>
                  </>
                )}
              </div>

              {/* Per-item breakdown */}
              <ul className="space-y-1 pl-6">
                {inventory.items.map((item, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted-foreground">
                      {item.product_name}
                      {item.variant_name ? ` — ${item.variant_name}` : ""}
                      {" "}
                      <span className="text-xs">(need: {item.requested_qty})</span>
                    </span>
                    {item.is_available ? (
                      <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                        {item.available_qty} in stock
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                        {item.available_qty === null ? "No record" : `Only ${item.available_qty} available`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {hasOOS && (
                <p className="text-xs text-amber-600 dark:text-amber-400 pt-1">
                  You can reject this request or force-approve it (creates replacement order despite OOS — ops team will need to source the item manually).
                </p>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ── Note field ───────────────────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          Note (required for rejection)
        </label>
        <textarea
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          rows={2}
          maxLength={500}
          placeholder={`Add a note to the customer about this ${label}…`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={isPending}
        />
      </div>

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 justify-end">
        {/* Reject */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
          onClick={() => handleAction("reject")}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Reject
        </Button>

        {/* Force approve — replacement OOS override */}
        {requestType === "replacement" && hasOOS && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50 dark:border-amber-700 dark:hover:bg-amber-950"
            onClick={() => handleAction("approve_forced")}
            disabled={isPending}
            title="Create replacement order even though some items are out of stock"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Force Approve
          </Button>
        )}

        {/* Normal approve */}
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => handleAction("approve")}
          disabled={isPending || (requestType === "replacement" && hasOOS === true)}
          title={
            requestType === "replacement" && hasOOS
              ? "Cannot approve — items out of stock. Reject or use Force Approve."
              : undefined
          }
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {requestType === "replacement" && hasOOS
            ? "Approve (blocked — OOS)"
            : "Approve"}
        </Button>
      </div>

      {/* Restock reminder — shown after replacement is in progress */}
      {requestType === "replacement" && (
        <p className="text-xs text-muted-foreground">
          <PackageX className="inline h-3 w-3 mr-1" />
          Once the customer returns the item and it is physically received, use the restock action to add it back to inventory.
        </p>
      )}
    </div>
  );
}
