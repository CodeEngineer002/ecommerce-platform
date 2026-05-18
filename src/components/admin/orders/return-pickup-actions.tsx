"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  CircleDot,
  Loader2,
  Package,
  PackageCheck,
  Truck,
} from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

type PickupStatus =
  | "approved"
  | "pickup_scheduled"
  | "in_transit"
  | "received"
  | string; // other terminal statuses

interface Props {
  returnId:    string;
  returnStatus: PickupStatus;
}

interface Step {
  key:   string;
  label: string;
  icon:  React.ReactNode;
  done:  boolean;
  active: boolean;
}

/**
 * Shows the return pickup progress timeline + action buttons for the current step.
 * Rendered inside the admin order detail page for each return/replacement request
 * once the request is in a post-approval state (approved, pickup_scheduled,
 * in_transit, received).
 */
export function ReturnPickupActions({ returnId, returnStatus }: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const statusOrder = ["approved", "pickup_scheduled", "in_transit", "received"] as const;
  const currentIdx = statusOrder.indexOf(returnStatus as typeof statusOrder[number]);

  const steps: Step[] = [
    {
      key:    "approved",
      label:  "Return Approved",
      icon:   <CheckCircle2 className="h-4 w-4" />,
      done:   currentIdx >= 0,
      active: currentIdx === 0,
    },
    {
      key:    "pickup_scheduled",
      label:  "Pickup Scheduled",
      icon:   <Truck className="h-4 w-4" />,
      done:   currentIdx >= 1,
      active: currentIdx === 1,
    },
    {
      key:    "in_transit",
      label:  "Item Collected",
      icon:   <Package className="h-4 w-4" />,
      done:   currentIdx >= 2,
      active: currentIdx === 2,
    },
    {
      key:    "received",
      label:  "Received at Warehouse",
      icon:   <PackageCheck className="h-4 w-4" />,
      done:   currentIdx >= 3,
      active: currentIdx === 3,
    },
  ];

  async function advance(action: "schedule" | "collected" | "received") {
    startTransition(async () => {
      try {
        const result = await apiFetch<{ message: string }>(
          `/api/admin/returns/${returnId}/pickup`,
          {
            method: "PATCH",
            body:   JSON.stringify({ action, note: note.trim() || undefined }),
          },
        );
        toast.success(result.data.message);
        setNote("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  // Already past the pickup lifecycle — nothing to show
  if (currentIdx === -1 || currentIdx >= statusOrder.length) return null;

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Return Pickup Progress
      </p>

      {/* ── Timeline ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-0">
        {steps.map((step, i) => (
          <div key={step.key} className="flex flex-1 flex-col items-center">
            {/* Node */}
            <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors ${
              step.done
                ? "border-green-500 bg-green-500 text-white"
                : step.active
                  ? "border-primary bg-primary text-white"
                  : "border-muted-foreground/30 bg-background text-muted-foreground/50"
            }`}>
              {step.done && !step.active
                ? <CheckCircle2 className="h-4 w-4" />
                : step.active
                  ? <CircleDot className="h-4 w-4" />
                  : step.icon}
            </div>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div className={`relative w-full h-0.5 mt-3.5 -z-10 ${
                steps[i + 1].done || (i + 1 <= currentIdx)
                  ? "bg-green-500"
                  : "bg-muted-foreground/20"
              }`}
              style={{ marginLeft: "50%", marginRight: "-50%", width: "100%" }}
              />
            )}

            {/* Label */}
            <p className={`mt-2 text-center text-xs leading-tight ${
              step.done
                ? "font-medium text-green-700 dark:text-green-400"
                : step.active
                  ? "font-semibold text-primary"
                  : "text-muted-foreground/60"
            }`}>
              {step.label}
            </p>
          </div>
        ))}
      </div>

      {/* ── Action for current step ───────────────────────────────────────── */}
      {currentIdx < 3 && (
        <div className="space-y-3 border-t pt-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Note (optional)
            </label>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              rows={2}
              maxLength={500}
              placeholder={
                currentIdx === 0 ? "Courier name, pickup slot, etc."
                : currentIdx === 1 ? "Delivery agent name, vehicle, etc."
                : "Condition on arrival, inspection notes, etc."
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="flex justify-end">
            {currentIdx === 0 && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => advance("schedule")}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                Schedule Pickup
              </Button>
            )}

            {currentIdx === 1 && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => advance("collected")}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                Mark as Collected
              </Button>
            )}

            {currentIdx === 2 && (
              <Button
                size="sm"
                variant="default"
                className="gap-1.5 bg-green-600 hover:bg-green-700"
                onClick={() => advance("received")}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                Mark Received + Restock
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Complete state ────────────────────────────────────────────────── */}
      {currentIdx === 3 && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
          <PackageCheck className="h-4 w-4 shrink-0" />
          Item received and inventory restocked successfully.
        </div>
      )}
    </div>
  );
}
