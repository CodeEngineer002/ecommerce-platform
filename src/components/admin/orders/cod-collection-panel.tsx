"use client";

import { useState } from "react";
import { Banknote, CheckCircle, Loader2, AlertCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/utils";

interface Props {
  orderId:         string;
  orderTotal:      number;
  paymentStatus:   string;
  collectedAt?:    string | null;
  collectedBy?:    string | null;
}

export function CodCollectionPanel({
  orderId,
  orderTotal,
  paymentStatus,
  collectedAt,
}: Props) {
  const [notes, setNotes]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  // "Collected" only when payment is succeeded AND there is a collection timestamp in metadata
  const [collected, setCollected]   = useState(paymentStatus === "succeeded" && Boolean(collectedAt));

  // Already collected state — requires both succeeded status AND a real collection timestamp
  if (collected || (paymentStatus === "succeeded" && collectedAt)) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="flex items-center gap-3 pt-4 pb-4">
          <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">COD Cash Collected</p>
            {collectedAt && (
              <p className="text-xs text-green-600 mt-0.5">
                {new Date(collectedAt).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            )}
          </div>
          <Badge variant="outline" className="ml-auto border-green-400 text-green-700">
            {formatPrice(orderTotal)} collected
          </Badge>
        </CardContent>
      </Card>
    );
  }

  // Not yet collected
  if (paymentStatus !== "cod_pending_collection" && paymentStatus !== "pending") {
    return null;
  }

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/orders/${orderId}/cod-collect`, {
        method: "POST",
        body: JSON.stringify({ amount_collected: orderTotal, notes: notes || undefined }),
      });
      setCollected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm COD collection");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-amber-800">
          <Banknote className="h-5 w-5" />
          COD — Cash Collection Pending
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md bg-white border border-amber-200 px-3 py-2">
          <span className="text-sm text-muted-foreground">Amount to collect</span>
          <span className="font-semibold text-amber-800">{formatPrice(orderTotal)}</span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cod-amount" className="text-sm">
            Confirm amount collected
          </Label>
          <Input
            id="cod-amount"
            type="number"
            value={orderTotal}
            readOnly
            className="bg-white border-amber-200 font-medium"
          />
          <p className="text-xs text-muted-foreground">
            Partial COD collection is not supported. Full amount must be collected.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cod-notes" className="text-sm">
            Notes (optional)
          </Label>
          <Textarea
            id="cod-notes"
            placeholder="e.g. Collected by delivery rider Ravi"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
          onClick={handleConfirm}
          disabled={loading}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white"
        >
          {loading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirming…</>
          ) : (
            <><CheckCircle className="mr-2 h-4 w-4" />Confirm Cash Collected</>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Only confirm after physically receiving cash from the customer.
          This action is audited and cannot be undone.
        </p>
      </CardContent>
    </Card>
  );
}
