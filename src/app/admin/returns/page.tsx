"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { CheckCircle2, XCircle, RefreshCw, Undo2 } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useAdminReturns } from "@/features/admin/hooks/use-admin-returns";

type StatusFilter = "all" | "requested" | "approved" | "rejected" | "cancelled" | "closed";

export default function AdminReturnsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("requested");
  const { returns, isLoading, refetch } = useAdminReturns(statusFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Returns & Replacements"
        description="Review and action customer return and replacement requests."
      />

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All requests</SelectItem>
            <SelectItem value="requested">Pending review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled by customer</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !returns || returns.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No requests found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {returns.map((r) => (
            <ReturnCard key={r.id} request={r} onUpdate={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Per-request card ────────────────────────────────────────────────────────

interface ReturnRequest {
  id: string;
  order_id: string;
  request_type: string;
  reason: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  order: { order_number: string } | null;
  items: {
    id: string;
    order_item_id: string;
    quantity: number;
    reason: string | null;
    condition: string | null;
    order_item: { product_name: string; variant_name: string | null } | null;
  }[];
}

function ReturnCard({ request: r, onUpdate }: { request: ReturnRequest; onUpdate: () => void }) {
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const isReplacement = r.request_type === "replacement";
  const isPendingReview = r.status === "requested";

  async function handleAction(action: "approve" | "reject") {
    if (action === "reject" && !note.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }
    startTransition(async () => {
      try {
        await apiFetch(`/api/admin/returns/${r.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action, note: note.trim() || undefined }),
        });
        toast.success(action === "approve" ? "Request approved" : "Request rejected");
        setNote("");
        onUpdate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            {/* Type badge */}
            <Badge
              variant="outline"
              className={isReplacement
                ? "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300"
                : "border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300"
              }
            >
              {isReplacement
                ? <><RefreshCw className="mr-1 h-3 w-3" /> Replacement Request</>
                : <><Undo2 className="mr-1 h-3 w-3" /> Return Request</>
              }
            </Badge>

            {/* Order link */}
            {r.order && (
              <p className="text-sm text-muted-foreground">
                Order{" "}
                <Link
                  href={`/admin/orders/${r.order_id}`}
                  className="font-medium text-primary hover:underline"
                >
                  #{r.order.order_number}
                </Link>
                {" "}· Submitted {formatDate(r.created_at)}
              </p>
            )}
          </div>
          <StatusBadge status={r.status as Parameters<typeof StatusBadge>[0]["status"]} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {/* Reason */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Reason</p>
          <p className="capitalize">{r.reason}</p>
        </div>

        {/* Items */}
        {r.items.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Items</p>
            <ul className="space-y-1">
              {r.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2">
                  <div>
                    <p className="font-medium">
                      {item.order_item?.product_name ?? "Item"}
                    </p>
                    {item.order_item?.variant_name && (
                      <p className="text-xs text-muted-foreground">{item.order_item.variant_name}</p>
                    )}
                    {item.condition && (
                      <p className="text-xs text-muted-foreground capitalize">Condition: {item.condition}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">Qty: {item.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Reviewed note */}
        {r.review_note && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              {r.status === "rejected" ? "Rejection reason" : "Admin note"}
            </p>
            <p>{r.review_note}</p>
          </div>
        )}

        {/* Cancelled by customer — display notice, no actions */}
        {r.status === "cancelled" && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Cancelled by customer
            </p>
            <p className="text-xs text-muted-foreground">
              The customer cancelled this request before any action was taken. No further action is needed.
            </p>
          </div>
        )}

        {/* Admin actions — only for pending review */}
        {isPendingReview && (
          <div className="space-y-3 border-t pt-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                Note (required for rejection)
              </label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                rows={2}
                maxLength={500}
                placeholder="Add a note for the customer…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
                onClick={() => handleAction("reject")}
                disabled={isPending}
              >
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => handleAction("approve")}
                disabled={isPending}
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
