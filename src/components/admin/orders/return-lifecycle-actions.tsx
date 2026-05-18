"use client";

/**
 * ReturnLifecycleActions
 *
 * Shown for return requests in: received, inspected, accepted, or replaced/refunded.
 * Lets admins advance the return through the post-warehouse stages:
 *
 *   received → inspected → accepted ──→ closed
 *                        └─→ rejected_after_inspection
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Loader2, X } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";

type LifecycleStatus =
  | "received"
  | "inspected"
  | "accepted"
  | "rejected_after_inspection"
  | "refunded"
  | "replaced"
  | "closed";

interface ReturnLifecycleActionsProps {
  returnId: string;
  returnStatus: string;
}

const STAGE_ORDER: LifecycleStatus[] = [
  "received",
  "inspected",
  "accepted",
  "closed",
];

const STAGE_LABELS: Record<string, string> = {
  received:                    "Received",
  inspected:                   "Inspected",
  accepted:                    "Accepted",
  rejected_after_inspection:   "Rejected",
  refunded:                    "Refunded",
  replaced:                    "Replaced",
  closed:                      "Closed",
};

export function ReturnLifecycleActions({
  returnId,
  returnStatus,
}: ReturnLifecycleActionsProps) {
  const router = useRouter();

  const [notes, setNotes]     = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason]     = useState("");

  const currentIdx = STAGE_ORDER.indexOf(returnStatus as LifecycleStatus);
  const isTerminal = ["closed", "rejected_after_inspection", "refunded", "replaced"].includes(returnStatus);

  async function callLifecycle(action: string, extraBody?: Record<string, unknown>) {
    setPending(action);
    try {
      const res = await fetch(`/api/admin/returns/${returnId}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes: notes.trim() || undefined, ...extraBody }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? `Failed: ${action}`);

      toast.success(`Return marked as ${STAGE_LABELS[action] ?? action}`);
      setNotes("");
      setShowRejectForm(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Action ${action} failed`);
    } finally {
      setPending(null);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    await callLifecycle("rejected_after_inspection", { notes: rejectReason.trim() });
  }

  // ── Stage timeline display ─────────────────────────────────────────────────

  const stageStatuses = ["received", "inspected", "accepted", "closed"];

  return (
    <div className="space-y-4">
      {/* Stage progress timeline */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {stageStatuses.map((stage, idx) => {
          const stageIdx = STAGE_ORDER.indexOf(stage as LifecycleStatus);
          const isDone = currentIdx > stageIdx || returnStatus === stage;
          const isCurrent = returnStatus === stage;

          return (
            <div key={stage} className="flex items-center gap-1.5">
              <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                isCurrent
                  ? "bg-primary text-primary-foreground"
                  : isDone
                    ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                    : "bg-muted text-muted-foreground"
              }`}>
                {isDone && !isCurrent && <CheckCircle2 className="h-3 w-3" />}
                {STAGE_LABELS[stage]}
              </div>
              {idx < stageStatuses.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
          );
        })}

        {returnStatus === "rejected_after_inspection" && (
          <div className="flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            <X className="h-3 w-3" /> Rejected after inspection
          </div>
        )}
      </div>

      {isTerminal && (
        <p className="text-xs text-muted-foreground">This return request has been finalised.</p>
      )}

      {/* Actions based on current status */}
      {!isTerminal && (
        <div className="space-y-3">
          {/* Optional notes field */}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional note (visible in order timeline)…"
            className="w-full rounded-md border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />

          <div className="flex flex-wrap items-center gap-2">
            {/* received → inspected */}
            {returnStatus === "received" && (
              <Button
                size="sm"
                onClick={() => callLifecycle("inspected")}
                disabled={!!pending}
              >
                {pending === "inspected" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Mark Inspected
              </Button>
            )}

            {/* inspected → accepted */}
            {returnStatus === "inspected" && (
              <>
                <Button
                  size="sm"
                  onClick={() => callLifecycle("accepted")}
                  disabled={!!pending}
                >
                  {pending === "accepted" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Accept Return
                </Button>

                {!showRejectForm ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setShowRejectForm(true)}
                    disabled={!!pending}
                  >
                    Reject After Inspection
                  </Button>
                ) : (
                  <div className="w-full space-y-2 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
                    <p className="text-xs font-medium text-red-800 dark:text-red-300">Rejection reason *</p>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      placeholder="Explain why the return is being rejected…"
                      className="w-full rounded-md border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleReject}
                        disabled={!!pending || !rejectReason.trim()}
                      >
                        {pending === "rejected_after_inspection" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        Confirm Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setShowRejectForm(false); setRejectReason(""); }}
                        disabled={!!pending}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* accepted → closed */}
            {returnStatus === "accepted" && (
              <Button
                size="sm"
                onClick={() => callLifecycle("closed")}
                disabled={!!pending}
              >
                {pending === "closed" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Close Request
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
