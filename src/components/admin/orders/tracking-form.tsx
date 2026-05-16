"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";

export interface FulfillmentData {
  id:                 string | null;
  carrier:            string | null;
  tracking_number:    string | null;
  tracking_url:       string | null;
  estimated_delivery: string | null;
  status:             string | null;
}

interface Props {
  orderId:     string;
  fulfillment: FulfillmentData | null;
  onSaved?:    () => void;
}

export function AdminTrackingForm({ orderId, fulfillment, onSaved }: Props) {
  const isUpdate = Boolean(fulfillment?.id);

  const [carrier,           setCarrier]           = useState(fulfillment?.carrier ?? "");
  const [trackingNumber,    setTrackingNumber]     = useState(fulfillment?.tracking_number ?? "");
  const [trackingUrl,       setTrackingUrl]        = useState(fulfillment?.tracking_url ?? "");
  const [estimatedDelivery, setEstimatedDelivery]  = useState(
    fulfillment?.estimated_delivery
      ? fulfillment.estimated_delivery.slice(0, 10)  // trim to YYYY-MM-DD for date input
      : "",
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      if (isUpdate) {
        // PATCH — update tracking on existing fulfillment
        await apiFetch(`/api/admin/orders/${orderId}/fulfillment`, {
          method: "PATCH",
          body: JSON.stringify({
            fulfillment_id:    fulfillment!.id!,
            carrier:           carrier       || undefined,
            tracking_number:   trackingNumber || undefined,
            tracking_url:      trackingUrl    || undefined,
            estimated_delivery: estimatedDelivery
              ? new Date(estimatedDelivery).toISOString()
              : undefined,
          }),
        });
        toast.success("Tracking updated");
      } else {
        // POST — create new fulfillment with tracking
        await apiFetch(`/api/admin/orders/${orderId}/fulfillment`, {
          method: "POST",
          body: JSON.stringify({
            carrier:           carrier       || undefined,
            tracking_number:   trackingNumber || undefined,
            tracking_url:      trackingUrl    || undefined,
            estimated_delivery: estimatedDelivery
              ? new Date(estimatedDelivery).toISOString()
              : undefined,
          }),
        });
        toast.success("Tracking saved");
      }
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save tracking");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="carrier">Carrier</Label>
          <Input
            id="carrier"
            placeholder="e.g. Delhivery, FedEx, Blue Dart"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tracking_number">Tracking Number</Label>
          <Input
            id="tracking_number"
            placeholder="e.g. 1234567890"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="tracking_url">Tracking URL</Label>
          <Input
            id="tracking_url"
            type="url"
            placeholder="https://track.carrier.com/..."
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="estimated_delivery">Estimated Delivery</Label>
          <Input
            id="estimated_delivery"
            type="date"
            value={estimatedDelivery}
            onChange={(e) => setEstimatedDelivery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : isUpdate ? "Update Tracking" : "Save Tracking"}
        </Button>
      </div>
    </form>
  );
}
