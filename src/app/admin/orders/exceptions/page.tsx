"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/utils";

type ExceptionStatus = "open" | "resolved";

interface OrderException {
  id: string;
  order_id: string;
  exception_type: string;
  status: ExceptionStatus;
  detected_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  metadata: Record<string, unknown>;
  orders: { order_number: string; status: string } | null;
}

const EXCEPTION_TYPE_LABELS: Record<string, string> = {
  stuck_confirmed:         "Stuck: Confirmed",
  stuck_processing:        "Stuck: Processing",
  stuck_packed:            "Stuck: Packed",
  stuck_shipped:           "Stuck: Shipped",
  stuck_out_for_delivery:  "Stuck: Out for Delivery",
  stuck_return_in_transit: "Stuck: Return in Transit",
  cod_collection_overdue:  "COD Collection Overdue",
};

function ExceptionTypePill({ type }: { type: string }) {
  const isCod = type === "cod_collection_overdue";
  const bg = isCod ? "bg-orange-100 text-orange-800" : "bg-yellow-100 text-yellow-800";
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${bg}`}>
      {EXCEPTION_TYPE_LABELS[type] ?? type}
    </span>
  );
}

function useExceptions(status: ExceptionStatus) {
  const [data, setData] = useState<OrderException[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: OrderException[] }>(
        `/api/admin/order-exceptions?status=${status}`,
      );
      setData(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load exceptions");
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, load };
}

export default function OrderExceptionsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<ExceptionStatus>("open");
  const [exceptions, setExceptions] = useState<OrderException[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = async (status: ExceptionStatus) => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await apiFetch<{ data: OrderException[] }>(
        `/api/admin/order-exceptions?status=${status}`,
      );
      setExceptions(res.data ?? []);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load exceptions");
    } finally {
      setLoading(false);
    }
  };

  // Load on first render
  useEffect(() => { void load("open"); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = (status: ExceptionStatus) => {
    setTab(status);
    void load(status);
  };

  const handleResolve = async (ex: OrderException) => {
    setResolving(ex.id);
    try {
      await apiFetch(`/api/admin/order-exceptions/${ex.id}`, {
        method: "PATCH",
        body: JSON.stringify({ resolution_note: note[ex.id] ?? "" }),
      });
      void load(tab);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to resolve exception");
    } finally {
      setResolving(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Order Exceptions"
        description="Orders that require manual review — stuck orders and overdue COD collections."
      />

      {/* Tab bar */}
      <div className="flex gap-2 border-b">
        {(["open", "resolved"] as ExceptionStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => handleTabChange(s)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === s
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => load(tab)} disabled={loading}>
          Refresh
        </Button>
      </div>

      {/* Error */}
      {fetchError && (
        <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>
      )}

      {/* Empty */}
      {!loading && exceptions !== null && exceptions.length === 0 && (
        <div className="py-12 text-center text-muted-foreground text-sm">
          {tab === "open" ? "No open exceptions." : "No resolved exceptions."}
        </div>
      )}

      {/* Table */}
      {!loading && exceptions && exceptions.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Order</th>
                <th className="px-4 py-3 text-left font-medium">Exception</th>
                <th className="px-4 py-3 text-left font-medium">Detected</th>
                {tab === "open" && (
                  <th className="px-4 py-3 text-left font-medium">Resolution Note</th>
                )}
                {tab === "resolved" && (
                  <th className="px-4 py-3 text-left font-medium">Resolved</th>
                )}
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {exceptions.map((ex) => (
                <tr key={ex.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${ex.order_id}`}
                      className="font-mono text-primary hover:underline font-medium"
                    >
                      {ex.orders?.order_number ?? ex.order_id.slice(0, 8)}
                    </Link>
                    {ex.orders?.status && (
                      <p className="text-xs text-muted-foreground capitalize mt-0.5">
                        {ex.orders.status.replace(/_/g, " ")}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ExceptionTypePill type={ex.exception_type} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(ex.detected_at)}
                  </td>
                  {tab === "open" && (
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        placeholder="Optional note…"
                        value={note[ex.id] ?? ""}
                        onChange={(e) =>
                          setNote((prev) => ({ ...prev, [ex.id]: e.target.value }))
                        }
                        className="w-full rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </td>
                  )}
                  {tab === "resolved" && (
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {ex.resolved_at ? formatDate(ex.resolved_at) : "—"}
                      {ex.resolution_note && (
                        <p className="mt-0.5 text-xs italic">{ex.resolution_note}</p>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    {tab === "open" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resolving === ex.id}
                        onClick={() => handleResolve(ex)}
                      >
                        {resolving === ex.id ? "Resolving…" : "Resolve"}
                      </Button>
                    ) : (
                      <Link href={`/admin/orders/${ex.order_id}`}>
                        <Button size="sm" variant="ghost">
                          View Order
                        </Button>
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
