"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackageX } from "lucide-react";

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

interface Props {
  orderId:    string;
  orderItems: OrderItem[];
}

export function ReturnForm({ orderId, orderItems }: Props) {
  const router = useRouter();
  const { mutateAsync: requestReturn, isPending } = useRequestReturn();

  const [reason,     setReason]     = useState("");
  const [customNote, setCustomNote] = useState("");
  // qty[itemId] = number of units selected for return
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  // condition[itemId] = selected condition
  const [conditions, setConditions] = useState<Record<string, string>>({});

  const selectedItems = Object.entries(returnQtys).filter(([, qty]) => qty > 0);
  const isValid =
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
      await requestReturn({ orderId, reason: fullReason, items });
      router.push(ROUTES.order(orderId));
      router.refresh();
    } catch {
      // error toast handled by the hook
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Item selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select items to return</CardTitle>
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

      {/* Return reason */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reason for return</CardTitle>
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
          <PackageX className="h-4 w-4" />
          {isPending ? "Submitting…" : "Submit Return Request"}
        </Button>
      </div>
    </form>
  );
}
