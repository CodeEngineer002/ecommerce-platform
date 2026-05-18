"use client";

import { useRef, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Pencil, X, ExternalLink } from "lucide-react";

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

  const [carrier,           setCarrier]           = useState(fulfillment?.carrier ?? "");
  // Start empty on server; useEffect sets auto-generated value on client only.
  // This prevents SSR hydration mismatch caused by crypto.getRandomValues().
  const [trackingNumber,    setTrackingNumber]     = useState(fulfillment?.tracking_number ?? "");

  useEffect(() => {
    if (!fulfillment?.tracking_number) {
      setTrackingNumber(generateTrackingNumber());
    }
  // Run once on mount (client only)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [trackingUrl,       setTrackingUrl]        = useState(fulfillment?.tracking_url ?? "");
  const [estimatedDelivery, setEstimatedDelivery]  = useState(
    fulfillment?.estimated_delivery
      ? fulfillment.estimated_delivery.slice(0, 10)
      : addDays(orderCreatedAt, 3),
  );
  const [saving,    setSaving]    = useState(false);
  // When tracking already exists, start in view (read-only) mode
  const [editing,   setEditing]   = useState(!isUpdate);

  const urlManuallyEdited = useRef(Boolean(fulfillment?.tracking_url));

  function handleCarrierOrTrackingChange(newCarrier: string, newTracking: string) {
    if (!urlManuallyEdited.current) {
      const auto = buildTrackingUrl(newCarrier, newTracking);
      if (auto) setTrackingUrl(auto);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const finalUrl = trackingUrl || buildTrackingUrl(carrier, trackingNumber);

    try {
      if (isUpdate) {
        await apiFetch(`/api/admin/orders/${orderId}/fulfillment`, {
          method: "PATCH",
          body: JSON.stringify({
            fulfillment_id:     fulfillment!.id!,
            carrier:            carrier       || undefined,
            tracking_number:    trackingNumber || undefined,
            tracking_url:       finalUrl       || undefined,
            estimated_delivery: estimatedDelivery
              ? new Date(estimatedDelivery).toISOString()
              : undefined,
          }),
        });
        toast.success("Tracking updated");
        setEditing(false);
      } else {
        const successMsg =
          shipmentType === "return_pickup"        ? "Return pickup tracking saved" :
          shipmentType === "replacement_outbound" ? "Replacement shipment tracking saved" :
          "Tracking saved — order marked as shipped";

        await apiFetch(`/api/admin/orders/${orderId}/fulfillment`, {
          method: "POST",
          body: JSON.stringify({
            carrier:            carrier       || undefined,
            tracking_number:    trackingNumber || undefined,
            tracking_url:       finalUrl       || undefined,
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

  // ── Read-only view (when tracking exists and not in edit mode) ──────────────
  if (isUpdate && !editing) {
    return (
      <div className="space-y-3">
        {shipmentType !== "outbound_original" && (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {shipmentLabel} tracking
          </p>
        )}

        <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-2 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1.5 min-w-0">
              {carrier && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-28 shrink-0">Carrier</span>
                  <span className="font-medium">{carrier}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-28 shrink-0">Tracking No.</span>
                <span className="font-mono text-xs truncate">{trackingNumber}</span>
              </div>
              {trackingUrl && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-28 shrink-0">Tracking URL</span>
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1 truncate"
                  >
                    Open <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              )}
              {estimatedDelivery && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-28 shrink-0">Est. delivery</span>
                  <span>
                    {new Date(estimatedDelivery).toLocaleDateString("en-IN", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </span>
                </div>
              )}
            </div>

            {/* Edit button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setEditing(true)}
              title="Edit tracking"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Edit / create form ──────────────────────────────────────────────────────
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
            className={!isUpdate ? "bg-muted text-muted-foreground cursor-default select-all" : ""}
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

      <div className="flex items-center justify-end gap-2">
        {/* Cancel only available when editing an existing record */}
        {isUpdate && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
            className="gap-1.5"
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : isUpdate ? "Update Tracking" : "Save Tracking"}
        </Button>
      </div>
    </form>
  );
}
