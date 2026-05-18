"use client";

import { useRef, useMemo } from "react";
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

type ShipmentType =
  | "outbound_original"
  | "return_pickup"
  | "replacement_outbound"
  | "exchange_pickup"
  | "return_to_origin";

const SHIPMENT_TYPE_LABELS: Record<ShipmentType, string> = {
  outbound_original:    "Original Shipment",
  return_pickup:        "Return Pickup",
  replacement_outbound: "Replacement Shipment",
  exchange_pickup:      "Exchange Pickup",
  return_to_origin:     "Return to Origin",
};

interface Props {
  orderId:          string;
  orderCreatedAt:   string;   // ISO string — used to default estimated delivery
  fulfillment:      FulfillmentData | null;
  shipmentType?:    ShipmentType;   // for new fulfillments only
  requestId?:       string;         // link to order_return.id for return/replacement shipments
  onSaved?:         () => void;
}

/** Generate a unique internal tracking number: TRK-YYYYMMDD-XXXXXX */
function generateTrackingNumber(): string {
  const date = new Date();
  const yyyymmdd = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // unambiguous charset
  let suffix = "";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  arr.forEach((b) => { suffix += chars[b % chars.length]; });
  return `TRK-${yyyymmdd}-${suffix}`;
}

/** Return YYYY-MM-DD string N days after the given ISO date */
function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Auto-generate tracking URL from carrier name + tracking number */
function buildTrackingUrl(carrier: string, trackingNumber: string): string {
  const c = carrier.toLowerCase().trim();
  const t = encodeURIComponent(trackingNumber.trim());
  if (!t) return "";
  if (c.includes("delhivery"))  return `https://www.delhivery.com/track/package/${t}`;
  if (c.includes("bluedart") || c.includes("blue dart")) return `https://www.bluedart.com/web/guest/trackdartship?trackfor=${t}`;
  if (c.includes("shiprocket")) return `https://shiprocket.co/tracking/${t}`;
  if (c.includes("fedex"))      return `https://www.fedex.com/apps/fedextrack/?tracknumbers=${t}`;
  if (c.includes("dtdc"))       return `https://www.dtdc.in/trace.asp?Cnno=${t}`;
  if (c.includes("ecom") || c.includes("ekart")) return `https://ecomexpress.in/tracking/?awb_field=${t}`;
  if (c.includes("xpressbees")) return `https://www.xpressbees.com/shipment/tracking?awbNo=${t}`;
  // Fallback: Google search
  return `https://www.google.com/search?q=track+${encodeURIComponent(carrier)}+${t}`;
}

export function AdminTrackingForm({ orderId, orderCreatedAt, fulfillment, shipmentType = "outbound_original", requestId, onSaved }: Props) {
  const isUpdate = Boolean(fulfillment?.id);

  // Auto-generate tracking number once when no tracking exists yet
  const autoTracking = useMemo(
    () => fulfillment?.tracking_number ?? generateTrackingNumber(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [carrier,           setCarrier]           = useState(fulfillment?.carrier ?? "");
  const [trackingNumber,    setTrackingNumber]     = useState(autoTracking);
  const [trackingUrl,       setTrackingUrl]        = useState(fulfillment?.tracking_url ?? "");
  const [estimatedDelivery, setEstimatedDelivery]  = useState(
    fulfillment?.estimated_delivery
      ? fulfillment.estimated_delivery.slice(0, 10)
      : addDays(orderCreatedAt, 3),
  );
  const [saving, setSaving] = useState(false);

  // Track whether URL was manually edited (if so, don't overwrite on auto-fill)
  const urlManuallyEdited = useRef(Boolean(fulfillment?.tracking_url));

  // Auto-fill tracking URL when carrier + tracking number change
  function handleCarrierOrTrackingChange(newCarrier: string, newTracking: string) {
    if (!urlManuallyEdited.current) {
      const auto = buildTrackingUrl(newCarrier, newTracking);
      if (auto) setTrackingUrl(auto);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    // Auto-generate tracking URL if not set
    const finalUrl = trackingUrl || buildTrackingUrl(carrier, trackingNumber);

    try {
      if (isUpdate) {
        await apiFetch(`/api/admin/orders/${orderId}/fulfillment`, {
          method: "PATCH",
          body: JSON.stringify({
            fulfillment_id:    fulfillment!.id!,
            carrier:           carrier       || undefined,
            tracking_number:   trackingNumber || undefined,
            tracking_url:      finalUrl       || undefined,
            estimated_delivery: estimatedDelivery
              ? new Date(estimatedDelivery).toISOString()
              : undefined,
          }),
        });
        toast.success("Tracking updated");
      } else {
        const successMsg =
          shipmentType === "return_pickup"        ? "Return pickup tracking saved" :
          shipmentType === "replacement_outbound" ? "Replacement shipment tracking saved" :
          "Tracking saved — order marked as shipped";

        await apiFetch(`/api/admin/orders/${orderId}/fulfillment`, {
          method: "POST",
          body: JSON.stringify({
            carrier:           carrier       || undefined,
            tracking_number:   trackingNumber || undefined,
            tracking_url:      finalUrl       || undefined,
            estimated_delivery: estimatedDelivery
              ? new Date(estimatedDelivery).toISOString()
              : undefined,
            shipment_type: shipmentType,
            request_id:    requestId || undefined,
          }),
        });
        toast.success(successMsg);
      }
      if (finalUrl && finalUrl !== trackingUrl) setTrackingUrl(finalUrl);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save tracking");
    } finally {
      setSaving(false);
    }
  }

  const shipmentLabel = SHIPMENT_TYPE_LABELS[shipmentType] ?? "Shipment";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {shipmentType !== "outbound_original" && (
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {shipmentLabel} tracking
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="carrier">Carrier</Label>
          <Input
            id="carrier"
            placeholder="e.g. Delhivery, FedEx, Blue Dart"
            value={carrier}
            onChange={(e) => {
              setCarrier(e.target.value);
              handleCarrierOrTrackingChange(e.target.value, trackingNumber);
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tracking_number">
            Tracking Number / AWB
            {!isUpdate && (
              <span className="ml-1.5 text-xs text-muted-foreground">(auto-generated)</span>
            )}
          </Label>
          <Input
            id="tracking_number"
            placeholder="e.g. 1234567890"
            value={trackingNumber}
            readOnly={!isUpdate}
            className={!isUpdate ? "bg-muted text-muted-foreground cursor-default" : ""}
            onChange={(e) => {
              if (isUpdate) {
                setTrackingNumber(e.target.value);
                handleCarrierOrTrackingChange(carrier, e.target.value);
              }
            }}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="tracking_url">
            Tracking URL
            <span className="ml-1.5 text-xs text-muted-foreground">(auto-filled from carrier)</span>
          </Label>
          <Input
            id="tracking_url"
            type="url"
            placeholder="https://track.carrier.com/..."
            value={trackingUrl}
            onChange={(e) => {
              urlManuallyEdited.current = true;
              setTrackingUrl(e.target.value);
            }}
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
