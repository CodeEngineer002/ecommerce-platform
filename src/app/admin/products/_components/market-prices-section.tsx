"use client";

import { CheckCircle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import type { AdminVariant } from "../catalog-utils";

// Supported currencies — keep in sync with REGION_CONFIGS in
// src/lib/i18n/region-config.ts. The DB stores any 3-letter ISO code so this
// list is a UX guard, not a constraint.
const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD ($) — United States" },
  { value: "GBP", label: "GBP (£) — United Kingdom" },
  { value: "EUR", label: "EUR (€) — Eurozone" },
  { value: "INR", label: "INR (₹) — India" },
  { value: "AED", label: "AED (د.إ) — UAE" },
];

interface PriceRow {
  id:             string;
  variant_id:     string;
  currency_code:  string;
  price:          number;
  compare_price:  number | null;
  is_active:      boolean;
}

interface Props {
  productId: string;
  variants:  AdminVariant[];
}

export function MarketPricesSection({ productId, variants }: Props) {
  const [rows, setRows]       = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    variants[0]?.id ?? "",
  );
  const [showAdd, setShowAdd] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ rows: PriceRow[] }>(
        `/api/admin/product-variant-prices?product_id=${productId}`,
      );
      setRows(res.data.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load market prices");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  // Variants with no rows at all show up first so ops can spot gaps quickly
  const variantOptions = useMemo(() => {
    return variants.map((v) => {
      const count = rows.filter((r) => r.variant_id === v.id).length;
      return { ...v, priceCount: count };
    });
  }, [variants, rows]);

  const selectedVariant = variants.find((v) => v.id === selectedVariantId);
  const variantRows = rows.filter((r) => r.variant_id === selectedVariantId);
  const usedCurrencies = new Set(variantRows.map((r) => r.currency_code));
  const availableCurrencies = CURRENCY_OPTIONS.filter((c) => !usedCurrencies.has(c.value));

  if (variants.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Create at least one variant in the Variants tab before configuring market prices.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Market Prices</CardTitle>
        <p className="text-sm text-muted-foreground">
          Optional per-currency price overrides. When a customer&apos;s currency has no override
          here, checkout falls back to the variant&apos;s base price — same as today. Set a row
          here when you need a marketing-driven number for a specific market (e.g. INR ₹2,999
          instead of an FX-converted ₹12,500).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Variant selector */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[260px] space-y-1">
            <Label className="text-xs">Variant</Label>
            <Select
              value={selectedVariantId}
              onValueChange={(v) => { setSelectedVariantId(v); setShowAdd(false); }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {variantOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name ?? v.sku ?? v.id.slice(0, 8)} — {v.priceCount} market{v.priceCount === 1 ? "" : "s"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAdd((s) => !s)}
            disabled={availableCurrencies.length === 0}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add market price
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Add new row form */}
        {showAdd && selectedVariantId && availableCurrencies.length > 0 && (
          <AddPriceForm
            variantId={selectedVariantId}
            availableCurrencies={availableCurrencies}
            onSaved={() => { setShowAdd(false); void fetchRows(); }}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {/* Existing rows table */}
        {loading && rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : variantRows.length === 0 ? (
          <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            No market prices configured for {selectedVariant?.name ?? "this variant"}. The legacy{" "}
            <code className="text-xs">variant.price</code> column will be used for every currency.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Currency</th>
                  <th className="py-2 pr-3 text-right">Price</th>
                  <th className="py-2 pr-3 text-right">Compare</th>
                  <th className="py-2 pr-3 text-center">Active</th>
                  <th className="py-2 pr-3 w-32 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {variantRows.map((row) => (
                  <PriceRowItem key={row.id} row={row} onChanged={fetchRows} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Add-row form

function AddPriceForm({
  variantId, availableCurrencies, onSaved, onCancel,
}: {
  variantId:           string;
  availableCurrencies: Array<{ value: string; label: string }>;
  onSaved:             () => void;
  onCancel:            () => void;
}) {
  const [currency, setCurrency] = useState(availableCurrencies[0]?.value ?? "USD");
  const [price, setPrice]       = useState("");
  const [compare, setCompare]   = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function save() {
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) {
      setError("Price must be a non-negative number.");
      return;
    }
    let cp: number | null = null;
    if (compare.trim() !== "") {
      cp = Number(compare);
      if (!Number.isFinite(cp) || cp < p) {
        setError("Compare price must be ≥ price (or empty).");
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/admin/product-variant-prices", {
        method: "POST",
        body: JSON.stringify({
          variant_id:    variantId,
          currency_code: currency,
          price:         p,
          compare_price: cp,
          is_active:     true,
        }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {availableCurrencies.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Price <span className="text-red-600">*</span></Label>
          <Input
            type="number" step="0.01" min="0"
            value={price} onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Compare price (optional)</Label>
          <Input
            type="number" step="0.01" min="0"
            value={compare} onChange={(e) => setCompare(e.target.value)}
            placeholder="—"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="button" onClick={save} disabled={saving || price.trim() === ""}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
          Save price
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Inline-editable row

function PriceRowItem({
  row, onChanged,
}: {
  row:       PriceRow;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice]     = useState(String(row.price));
  const [compare, setCompare] = useState(row.compare_price === null ? "" : String(row.compare_price));
  const [busy, setBusy]       = useState<"save" | "delete" | "toggle" | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setPrice(String(row.price));
      setCompare(row.compare_price === null ? "" : String(row.compare_price));
      setError(null);
    }
  }, [row, editing]);

  async function save() {
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) { setError("Invalid price"); return; }
    let cp: number | null = null;
    if (compare.trim() !== "") {
      cp = Number(compare);
      if (!Number.isFinite(cp) || cp < p) { setError("Compare must be ≥ price"); return; }
    }
    setBusy("save");
    setError(null);
    try {
      await apiFetch(`/api/admin/product-variant-prices/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ price: p, compare_price: cp }),
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive() {
    setBusy("toggle");
    try {
      await apiFetch(`/api/admin/product-variant-prices/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(`Delete the ${row.currency_code} price for this variant?`)) return;
    setBusy("delete");
    try {
      await apiFetch(`/api/admin/product-variant-prices/${row.id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  if (editing) {
    return (
      <tr className="border-b bg-muted/30">
        <td className="py-2 pr-3 font-mono">{row.currency_code}</td>
        <td className="py-2 pr-3">
          <Input
            type="number" step="0.01" min="0"
            value={price} onChange={(e) => setPrice(e.target.value)}
            className="h-8 text-right"
          />
        </td>
        <td className="py-2 pr-3">
          <Input
            type="number" step="0.01" min="0"
            value={compare} onChange={(e) => setCompare(e.target.value)}
            className="h-8 text-right"
            placeholder="—"
          />
        </td>
        <td className="py-2 pr-3 text-center">{row.is_active ? "Yes" : "No"}</td>
        <td className="py-2 pr-3">
          <div className="flex justify-end gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy === "save"}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={busy === "save"}>
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            </Button>
          </div>
          {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="py-2 pr-3 font-mono">{row.currency_code}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{row.price.toFixed(2)}</td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
        {row.compare_price === null ? "—" : row.compare_price.toFixed(2)}
      </td>
      <td className="py-2 pr-3 text-center">
        <button
          type="button"
          onClick={toggleActive}
          disabled={busy !== null}
          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
            row.is_active
              ? "bg-green-100 text-green-800 hover:bg-green-200"
              : "bg-amber-100 text-amber-800 hover:bg-amber-200"
          }`}
        >
          {busy === "toggle" ? <Loader2 className="h-3 w-3 animate-spin" /> : (row.is_active ? "Yes" : "No")}
        </button>
      </td>
      <td className="py-2 pr-3">
        <div className="flex justify-end gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={busy !== null}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={busy !== null}>
            {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
      </td>
    </tr>
  );
}
