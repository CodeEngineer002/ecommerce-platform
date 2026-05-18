"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, PackageX, RefreshCw, Undo2 } from "lucide-react";

import { useRequestReturn } from "@/features/orders/hooks/use-orders";
import type { ReturnItem } from "@/features/orders/services/order.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/lib/constants";

interface OrderItem {
  id:           string;
  product_name: string;
  variant_name: string | null;
  quantity:     number;
  unit_price:   number;
}

const RETURN_REASONS = [
  "Damaged or defective product",
  "Wrong item received",
  "Item not as described",
  "Changed my mind",
  "Better price available elsewhere",
  "Other",
] as const;

const ITEM_CONDITIONS = [
  { value: "unopened", label: "Unopened / Sealed" },
  { value: "good",     label: "Good condition" },
  { value: "damaged",  label: "Damaged" },
  { value: "defective", label: "Defective / Not working" },
] as const;

interface InventoryItemCheck {
  item_id:      string;
  variant_id:   string | null;
  product_name: string;
  variant_name: string | null;
  available_qty: number | null;
  is_available:  boolean;
}

interface Props {
  orderId:    string;
  orderItems: OrderItem[];
}

export function ReturnForm({ orderId, orderItems }: Props) {
  const router = useRouter();
  const { mutateAsync: requestReturn, isPending } = useRequestReturn();

  const [requestType, setRequestType] = useState<"return" | "replacement" | null>(null);
  const [reason,      setReason]      = useState("");
  const [customNote,  setCustomNote]  = useState("");
  const [returnQtys,  setReturnQtys]  = useState<Record<string, number>>({});
  const [conditions,  setConditions]  = useState<Record<string, string>>({});

  // Inventory state — used when requestType = 'replacement'
  const [inventoryMap,     setInventoryMap]     = useState<Record<string, InventoryItemCheck>>({});
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedItems = Object.entries(returnQtys).filter(([, qty]) => qty > 0);

  // Check stock availability for selected items when replacement is chosen
  const checkInventory = useCallback(
    async (itemIds: string[]) => {
      if (itemIds.length === 0) {
        setInventoryMap({});
        return;
      }
      setInventoryLoading(true);
      try {
        const qs = itemIds.join(",");
        const res = await fetch(
          `/api/orders/${orderId}/replacement-availability?item_ids=${qs}`,
        );
        if (!res.ok) throw new Error("Failed");
        const data = (await res.json()) as {
          data: { all_available: boolean; items: InventoryItemCheck[] };
        };
        const map: Record<string, InventoryItemCheck> = {};
        for (const item of data.data.items) {
          map[item.item_id] = item;
        }
        setInventoryMap(map);
      } catch {
        setInventoryMap({});
      } finally {
        setInventoryLoading(false);
      }
    },
    [orderId],
  );

  // Debounce check when selected items change (only for replacement)
  useEffect(() => {
    if (requestType !== "replacement") {
      setInventoryMap({});
      return;
    }
    const ids = selectedItems.map(([id]) => id);
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    checkTimeoutRef.current = setTimeout(() => checkInventory(ids), 400);
    return () => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestType, JSON.stringify(selectedItems.map(([id]) => id)), checkInventory]);

  // Also re-run when request type switches to replacement
  useEffect(() => {
    if (requestType === "replacement" && selectedItems.length > 0) {
      checkInventory(selectedItems.map(([id]) => id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestType]);
  const oosItems = selectedItems.filter(
    ([id]) => inventoryMap[id] && !inventoryMap[id].is_available,
  );
  const hasOOS = requestType === "replacement" && oosItems.length > 0;

  const isValid =
    requestType !== null &&
    reason.trim() !== "" &&
    selectedItems.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    const items: ReturnItem[] = selectedItems.map(([itemId, qty]) => ({
      order_item_id: itemId,
      quantity:      qty,
      condition:     (conditions[itemId] as ReturnItem["condition"]) ?? undefined,
      reason:        undefined,
    }));

    const fullReason = reason === "Other" && customNote.trim()
      ? customNote.trim()
      : reason;

    try {
      await requestReturn({ orderId, requestType: requestType!, reason: fullReason, items });
      router.push(ROUTES.order(orderId));
      router.refresh();
    } catch {
      // error toast handled by the hook
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Step 1: Request type ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What would you like to do?</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setRequestType("return")}
            className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
              requestType === "return"
                ? "border-primary bg-primary/5"
                : "hover:border-muted-foreground/40"
            }`}
          >
            <div className="flex items-center gap-2">
              <Undo2 className={`h-5 w-5 ${requestType === "return" ? "text-primary" : "text-muted-foreground"}`} />
              <span className="font-medium">Return</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Send the item back and receive a refund for your order.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setRequestType("replacement")}
            className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
              requestType === "replacement"
                ? "border-primary bg-primary/5"
                : "hover:border-muted-foreground/40"
            }`}
          >
            <div className="flex items-center gap-2">
              <RefreshCw className={`h-5 w-5 ${requestType === "replacement" ? "text-primary" : "text-muted-foreground"}`} />
              <span className="font-medium">Replacement</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Send the item back and receive the same item as a new replacement.
            </p>
          </button>
        </CardContent>
      </Card>

      {/* ── Step 2: Item selection ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Select items to {requestType === "replacement" ? "send back" : "return"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {orderItems.map((item) => {
            const qty = returnQtys[item.id] ?? 0;
            return (
              <div key={item.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.product_name}</p>
                    {item.variant_name && (
                      <p className="text-xs text-muted-foreground">{item.variant_name}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Ordered: {item.quantity} unit{item.quantity > 1 ? "s" : ""}
                    </p>

                    {/* Stock badge — only shown for replacement when item is selected */}
                    {requestType === "replacement" && returnQtys[item.id] > 0 && (
                      <div className="mt-1">
                        {inventoryLoading ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> Checking stock…
                          </span>
                        ) : inventoryMap[item.id] ? (
                          inventoryMap[item.id].is_available ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                              <CheckCircle2 className="h-3 w-3" /> In Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                              <AlertTriangle className="h-3 w-3" /> Out of Stock
                            </span>
                          )
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Label htmlFor={`qty-${item.id}`} className="text-xs text-muted-foreground">
                      Return qty:
                    </Label>
                    <select
                      id={`qty-${item.id}`}
                      className="rounded border bg-background px-2 py-1 text-sm"
                      value={qty}
                      onChange={(e) =>
                        setReturnQtys((prev) => ({
                          ...prev,
                          [item.id]: Number(e.target.value),
                        }))
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

                {/* Show condition selector only when qty > 0 */}
                {qty > 0 && (
                  <div className="pt-1">
                    <Label htmlFor={`cond-${item.id}`} className="text-xs">
                      Item condition
                    </Label>
                    <select
                      id={`cond-${item.id}`}
                      className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm"
                      value={conditions[item.id] ?? ""}
                      onChange={(e) =>
                        setConditions((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select condition…</option>
                      {ITEM_CONDITIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}

          {selectedItems.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-2">
              Select at least one item to continue
            </p>
          )}
        </CardContent>
      </Card>

      {/* Reason */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Reason for {requestType === "replacement" ? "replacement" : "return"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {RETURN_REASONS.map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  reason === r
                    ? "border-primary bg-primary/5 text-primary"
                    : "hover:border-muted-foreground/40"
                }`}
              >
                <input
                  type="radio"
                  name="return-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="sr-only"
                />
                {r}
              </label>
            ))}
          </div>

          {reason === "Other" && (
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              rows={3}
              maxLength={500}
              placeholder="Please describe the issue…"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
            />
          )}
        </CardContent>
      </Card>

      {/* OOS warning banner — shown for replacement when any selected item is OOS */}
      {hasOOS && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-medium text-amber-800 dark:text-amber-300">
                Some items are currently out of stock
              </p>
              <p className="text-amber-700 dark:text-amber-400">
                Replacement may not be possible right now. You can:
              </p>
              <ul className="list-disc pl-4 text-amber-700 dark:text-amber-400 space-y-0.5">
                <li>
                  Switch to <strong>Return</strong> to get a refund instead.
                </li>
                <li>
                  Submit the replacement request anyway — our team will contact you if the item cannot be sourced.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Go Back
        </Button>
        <Button
          type="submit"
          disabled={!isValid || isPending}
          className="gap-2"
        >
          {requestType === "replacement"
            ? <RefreshCw className="h-4 w-4" />
            : <PackageX className="h-4 w-4" />
          }
          {isPending
            ? "Submitting…"
            : requestType === "replacement"
              ? "Submit Replacement Request"
              : "Submit Return Request"
          }
        </Button>
      </div>
    </form>
  );
}
