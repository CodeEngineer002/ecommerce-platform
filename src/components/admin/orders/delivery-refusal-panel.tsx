"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, PackageX, Truck, CheckCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

type RefusalStage = "eligible" | "refused" | "rto_in_transit";

interface Props {
  orderId: string;
  status:  string;
}

function deriveStage(status: string): RefusalStage | null {
  if (status === "shipped" || status === "out_for_delivery") return "eligible";
  if (status === "delivery_refused")                          return "refused";
  if (status === "return_to_origin")                          return "rto_in_transit";
  return null;
}

export function DeliveryRefusalPanel({ orderId, status }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [note,   setNote]   = useState("");
  const [loading, setLoading] = useState<"refuse" | "rto" | "complete" | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const stage = deriveStage(status);
  if (!stage) return null;

  async function call(
    endpoint: string,
    body: Record<string, unknown>,
    action: typeof loading,
  ) {
    setLoading(action);
    setError(null);
    try {
      await apiFetch(`/api/admin/orders/${orderId}/${endpoint}`, {
        method: "POST",
        body:   JSON.stringify(body),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(null);
    }
  }

  // ── Stage 1: order is shipped / OFD → admin can mark refused ────────────
  if (stage === "eligible") {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-amber-800">
            <PackageX className="h-5 w-5" />
            Delivery Refusal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-amber-800">
            Use this only if the courier reported the customer refused the package.
            Inventory is held until you complete the RTO workflow.
          </p>

          <div className="space-y-2">
            <Label htmlFor="refusal-reason" className="text-sm">
              Refusal reason <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="refusal-reason"
              placeholder="e.g. Customer not reachable, address incorrect, package damaged"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-white border-amber-200 resize-none h-20"
              maxLength={500}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            onClick={() => call("mark-refused", { reason }, "refuse")}
            disabled={loading !== null || reason.trim().length < 3}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white"
          >
            {loading === "refuse" ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Marking refused…</>
            ) : (
              <><PackageX className="mr-2 h-4 w-4" />Mark Delivery Refused</>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Stage 2: refused → can move to RTO or skip-to-cancel ─────────────────
  if (stage === "refused") {
    return (
      <Card className="border-orange-200 bg-orange-50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-orange-800">
            <PackageX className="h-5 w-5" />
            Delivery Refused — Awaiting RTO
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-orange-800">
            The customer refused this package. When the carrier confirms RTO pickup or
            scan, advance to <strong>In Transit</strong>. When the warehouse receives the
            package, click <strong>Complete RTO</strong> to release inventory and cancel
            the order.
          </p>

          <div className="space-y-2">
            <Label htmlFor="rto-note" className="text-sm">Note (optional)</Label>
            <Textarea
              id="rto-note"
              placeholder="e.g. RTO scan received from Delhivery on 2026-05-23"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="bg-white border-orange-200 resize-none h-16"
              maxLength={500}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => call("rto-in-transit", { note: note || undefined }, "rto")}
              disabled={loading !== null}
              className="border-orange-400 text-orange-800 hover:bg-orange-100"
            >
              {loading === "rto" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Truck className="mr-2 h-4 w-4" />
              )}
              Mark RTO In Transit
            </Button>
            <Button
              onClick={() => call("complete-rto", { notes: note || undefined }, "complete")}
              disabled={loading !== null}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {loading === "complete" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Complete RTO (cancel)
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Completing RTO cancels the order and releases inventory.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Stage 3: RTO in transit → only completion left ───────────────────────
  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-orange-800">
          <Truck className="h-5 w-5" />
          RTO In Transit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-orange-800">
          Package is on its way back. Click <strong>Complete RTO</strong> when the
          warehouse confirms receipt — this releases inventory and cancels the order.
        </p>

        <div className="space-y-2">
          <Label htmlFor="complete-note" className="text-sm">Receipt note (optional)</Label>
          <Textarea
            id="complete-note"
            placeholder="e.g. Received intact, restocked to default warehouse"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="bg-white border-orange-200 resize-none h-16"
            maxLength={500}
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          onClick={() => call("complete-rto", { notes: note || undefined }, "complete")}
          disabled={loading !== null}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white"
        >
          {loading === "complete" ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Completing RTO…</>
          ) : (
            <><CheckCircle className="mr-2 h-4 w-4" />Complete RTO (cancel order)</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
