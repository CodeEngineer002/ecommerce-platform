"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, Loader2, PhoneCall, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

interface Props {
  orderId:                  string;
  /** From orders.cod_verification_required */
  verificationRequired:     boolean;
  /** From orders.cod_verified_at — ISO string when set */
  verifiedAt:               string | null;
}

/**
 * Mounts on the admin order-detail page when the order needs a COD
 * verification call. Renders three states:
 *   1. Required + unverified → call-to-action with verify/fail buttons
 *   2. Required + verified   → green confirmation
 *   3. Not required          → renders nothing
 */
export function CodVerificationPanel({ orderId, verificationRequired, verifiedAt }: Props) {
  const router = useRouter();
  const [note, setNote]       = useState("");
  const [reason, setReason]   = useState("");
  const [loading, setLoading] = useState<"verify" | "fail" | null>(null);
  const [error, setError]     = useState<string | null>(null);

  if (!verificationRequired) return null;

  // ── State 2: already verified ──────────────────────────────────────────
  if (verifiedAt) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="flex items-center gap-3 pt-4 pb-4">
          <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">COD Verified</p>
            <p className="text-xs text-green-600 mt-0.5">
              {new Date(verifiedAt).toLocaleString("en-IN", {
                dateStyle: "medium", timeStyle: "short",
              })}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  async function call(action: "verify" | "fail") {
    setLoading(action);
    setError(null);
    try {
      await apiFetch(`/api/admin/orders/${orderId}/cod-verify`, {
        method: "POST",
        body: JSON.stringify(
          action === "verify"
            ? { action: "verify", note: note || undefined }
            : { action: "fail",   reason },
        ),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(null);
    }
  }

  // ── State 1: required + unverified ─────────────────────────────────────
  return (
    <Card className="border-blue-300 bg-blue-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-blue-900">
          <PhoneCall className="h-5 w-5" />
          COD Verification Call Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-blue-900">
          This order exceeds the verification floor. Call the customer to confirm intent
          before the auto-queue ships it.
        </p>

        <div className="space-y-2">
          <Label htmlFor="verify-note" className="text-sm">Note (optional)</Label>
          <Textarea
            id="verify-note"
            placeholder="e.g. Spoke to Priya, confirmed delivery to home address"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="bg-white border-blue-200 resize-none h-16"
            maxLength={500}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="verify-reason" className="text-sm">
            …or failure reason (if call failed / customer abandoned)
          </Label>
          <Textarea
            id="verify-reason"
            placeholder="e.g. Number not reachable after 3 attempts"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="bg-white border-blue-200 resize-none h-16"
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
            onClick={() => call("verify")}
            disabled={loading !== null}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading === "verify" ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Marking verified…</>
            ) : (
              <><CheckCircle className="mr-2 h-4 w-4" />Mark Verified</>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => call("fail")}
            disabled={loading !== null || reason.trim().length < 3}
            className="border-red-300 text-red-700 hover:bg-red-50"
          >
            {loading === "fail" ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelling…</>
            ) : (
              <><XCircle className="mr-2 h-4 w-4" />Mark Failed (cancel)</>
            )}
          </Button>
        </div>

        <p className="text-xs text-blue-800/80 text-center">
          Until verified, the order stays in <strong>Confirmed</strong> — auto-queue
          will skip it.
        </p>
      </CardContent>
    </Card>
  );
}
