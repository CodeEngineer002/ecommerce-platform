"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle, Loader2, Plus, RefreshCw, Save, Trash2, Wallet, X,
} from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

const SUPPORTED_METHODS = ["cod", "stripe", "razorpay"] as const;
type MethodType = (typeof SUPPORTED_METHODS)[number];

interface MethodRow {
  id:             string;
  country_code:   string;
  method:         MethodType;
  is_enabled:     boolean;
  label:          string;
  description:    string | null;
  sort_order:     number;
  cod_max_amount: number | null;  // only meaningful when method='cod'
}

const COUNTRY_OPTIONS = [
  { value: "IN", label: "India (IN)" },
  { value: "US", label: "United States (US)" },
  { value: "UK", label: "United Kingdom (UK)" },
  { value: "DE", label: "Germany (DE)" },
  { value: "FR", label: "France (FR)" },
  { value: "IT", label: "Italy (IT)" },
  { value: "ES", label: "Spain (ES)" },
  { value: "AE", label: "UAE (AE)" },
];

const METHOD_DISPLAY: Record<string, string> = {
  cod:      "Cash on Delivery",
  stripe:   "Stripe (Card)",
  razorpay: "Razorpay",
};

export default function PaymentMethodsAdminPage() {
  const [country, setCountry] = useState("IN");
  const [rows, setRows]       = useState<MethodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ country });
      const res = await apiFetch<{ rows: MethodRow[] }>(
        `/api/admin/payment-methods?${params}`,
      );
      setRows(res.data.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [country]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  // Method types not yet configured for the current country — what the
  // "Add Payment Method" dialog lets admin pick from.
  const availableTypesToAdd = useMemo(() => {
    const inUse = new Set(rows.map((r) => r.method));
    return SUPPORTED_METHODS.filter((m) => !inUse.has(m));
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Methods"
        description="Toggle which payment methods customers see at checkout per country, and edit the labels they read."
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1">
            <Label className="text-xs">Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void fetchRows()} disabled={loading} variant="outline">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <div className="flex-1" />
          <Button
            onClick={() => setAddOpen(true)}
            disabled={availableTypesToAdd.length === 0}
            title={
              availableTypesToAdd.length === 0
                ? "All supported methods already configured for this country"
                : undefined
            }
          >
            <Plus className="mr-2 h-4 w-4" />Add Payment Method
          </Button>
        </CardContent>
      </Card>

      {addOpen && (
        <AddMethodDialog
          country={country}
          availableTypes={availableTypesToAdd}
          onClose={() => setAddOpen(false)}
          onCreated={() => { setAddOpen(false); void fetchRows(); }}
        />
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4">
        {rows.map((row) => (
          <MethodCard key={row.id} row={row} onSaved={fetchRows} />
        ))}
        {!loading && rows.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No methods configured for {country}.
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">How this is used</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            At checkout, customers see only methods where <strong>is_enabled = true</strong>
            for their shipping country, sorted by <strong>sort_order</strong> ascending.
          </p>
          <p>
            For Cash on Delivery, the country toggle is the FIRST gate. Even when enabled,
            COD still respects the region&apos;s amount cap (region-config codMaxAmount)
            and the pincode-level COD flag (serviceable_pincodes.cod_enabled).
          </p>
          <p>
            Disabling a method here takes effect immediately — no deploy needed.
            Customers already in checkout will be auto-switched to an available method.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// "Add Payment Method" dialog — choose a supported method type that isn't
// already configured for this country, then set its label + flags.

function AddMethodDialog({
  country, availableTypes, onClose, onCreated,
}: {
  country:        string;
  availableTypes: readonly MethodType[];
  onClose:        () => void;
  onCreated:      () => void;
}) {
  const [method, setMethod]           = useState<MethodType>(availableTypes[0] ?? "cod");
  const [label, setLabel]             = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder]     = useState(method === "cod" ? 1 : 10);
  const [enabled, setEnabled]         = useState(true);
  const [codCap, setCodCap]           = useState<string>("");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // Sensible label default per method type
  useEffect(() => {
    if (!label.trim()) {
      setLabel({
        cod:      "Cash on Delivery",
        stripe:   "Credit / Debit Card",
        razorpay: "Razorpay",
      }[method]);
      setSortOrder(method === "cod" ? 1 : method === "stripe" ? 10 : 20);
    }
    // intentionally only run when method changes — label can be edited freely afterwards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const codCapNumeric: number | null =
        codCap.trim() === "" ? null : Number(codCap);
      await apiFetch("/api/admin/payment-methods", {
        method: "POST",
        body:   JSON.stringify({
          country_code: country,
          method,
          is_enabled:   enabled,
          label:        label.trim(),
          description:  description.trim() || null,
          sort_order:   sortOrder,
          // Only meaningful when method='cod'; column ignored otherwise.
          ...(method === "cod" ? { cod_max_amount: codCapNumeric } : {}),
        }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="pb-3 flex flex-row items-start justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-5 w-5" />
            Add Payment Method to {country}
          </CardTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="space-y-3">
          {availableTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All platform-supported methods are already configured for {country}.
              Edit or delete existing entries to make changes.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Method type</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as MethodType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableTypes.map((m) => (
                      <SelectItem key={m} value={m}>{METHOD_DISPLAY[m] ?? m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Only platform-supported methods are listed. To add a new provider type
                  (e.g. PayPal, Apple Pay), update the DB constraint + integration code.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Label shown to customer</Label>
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sort order</Label>
                  <Input
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                    min={0} max={1000}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Description (optional)</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-16 resize-none"
                  maxLength={500}
                />
              </div>

              {method === "cod" && (
                <div className="space-y-1">
                  <Label className="text-xs">
                    COD max amount (country currency, blank = no cap)
                  </Label>
                  <Input
                    type="number"
                    value={codCap}
                    onChange={(e) => setCodCap(e.target.value)}
                    placeholder="e.g. 10000"
                    min={0}
                    step="0.01"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span>Enable immediately (customers see it at checkout)</span>
              </label>

              {error && <p className="text-sm text-red-700">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={saving || label.trim().length < 1}>
                  {saving
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</>
                    : <><Plus className="mr-2 h-4 w-4" />Create</>}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Single-method editor card

function MethodCard({ row, onSaved }: { row: MethodRow; onSaved: () => void }) {
  const [enabled, setEnabled]         = useState(row.is_enabled);
  const [label, setLabel]             = useState(row.label);
  const [description, setDescription] = useState(row.description ?? "");
  const [sortOrder, setSortOrder]     = useState(row.sort_order);
  // Empty string = "no cap"; numeric string = the cap. We keep this as a
  // string so admin can clear the field cleanly.
  const [codCap, setCodCap]           = useState<string>(
    row.cod_max_amount === null ? "" : String(row.cod_max_amount),
  );
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [saved, setSaved]             = useState(false);

  const isCod = row.method === "cod";

  // Reset local state when parent re-fetches and row changes underneath us.
  useEffect(() => {
    setEnabled(row.is_enabled);
    setLabel(row.label);
    setDescription(row.description ?? "");
    setSortOrder(row.sort_order);
    setCodCap(row.cod_max_amount === null ? "" : String(row.cod_max_amount));
    setSaved(false);
  }, [row.id, row.is_enabled, row.label, row.description, row.sort_order, row.cod_max_amount]);

  const codCapNumeric: number | null = codCap.trim() === "" ? null : Number(codCap);

  const isDirty =
    enabled        !== row.is_enabled  ||
    label          !== row.label       ||
    (description || null) !== row.description ||
    sortOrder      !== row.sort_order  ||
    (isCod && codCapNumeric !== row.cod_max_amount);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch(`/api/admin/payment-methods/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          is_enabled:    enabled,
          label:         label.trim(),
          description:   description.trim() || null,
          sort_order:    sortOrder,
          // Only send the cap for COD rows (the column is ignored otherwise).
          ...(isCod ? { cod_max_amount: codCapNumeric } : {}),
        }),
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Quick toggle without form save — atomic enable/disable
  async function quickToggle() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/payment-methods/${row.id}`, {
        method: "PATCH",
        body:   JSON.stringify({ is_enabled: !row.is_enabled }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const friendly = METHOD_DISPLAY[row.method] ?? row.method;
    if (!confirm(`Remove ${friendly} from ${row.country_code}? Customers in ${row.country_code} will no longer see this payment option.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/payment-methods/${row.id}`, { method: "DELETE" });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={enabled ? "border-green-200" : "border-muted"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-base">{METHOD_DISPLAY[row.method] ?? row.method}</p>
              <p className="text-xs font-normal text-muted-foreground font-mono">
                {row.country_code} · {row.method}
              </p>
            </div>
          </div>
          <button
            onClick={() => void quickToggle()}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              row.is_enabled ? "bg-green-500" : "bg-muted-foreground/30"
            }`}
            aria-label="Toggle enabled"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                row.is_enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2 space-y-1">
            <Label className="text-xs">Label shown to customer</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Cash on Delivery"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sort order</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              min={0}
              max={1000}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Description (sub-label, optional)</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Pay in cash when your order arrives."
            className="h-16 resize-none"
            maxLength={500}
          />
        </div>

        {isCod && (
          <div className="space-y-1">
            <Label className="text-xs">
              COD max amount (in country currency, leave blank for no cap)
            </Label>
            <Input
              type="number"
              value={codCap}
              onChange={(e) => setCodCap(e.target.value)}
              placeholder="e.g. 10000"
              min={0}
              step="0.01"
            />
            <p className="text-xs text-muted-foreground">
              Orders above this total can&apos;t use COD — customers see Stripe only.
              Blank = no cap (use with care).
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-700">{error}</p>}
        {saved && !isDirty && !error && (
          <p className="flex items-center gap-1 text-sm text-green-700">
            <CheckCircle className="h-4 w-4" /> Saved
          </p>
        )}

        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => void remove()}
            disabled={saving}
            className="text-red-700 hover:text-red-800 hover:bg-red-50"
          >
            <Trash2 className="mr-2 h-4 w-4" />Remove
          </Button>
          <Button onClick={save} disabled={saving || !isDirty}>
            {saving
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
              : <><Save className="mr-2 h-4 w-4" />Save changes</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
