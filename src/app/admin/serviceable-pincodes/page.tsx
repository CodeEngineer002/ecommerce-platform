"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle, Globe, Loader2, MapPin, RefreshCw, Search, Trash2, Upload, X,
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

interface PincodeRow {
  id:             string;
  country_code:   string;
  pincode:        string;
  city:           string | null;
  state:          string | null;
  is_deliverable: boolean;
  cod_enabled:    boolean;
  expected_days:  number | null;
  notes:          string | null;
}

interface CountrySummary {
  country_code: string;
  total:        number;
  cod_enabled:  number;
  deliverable:  number;
}

const COUNTRY_OPTIONS = [
  { value: "all", label: "All countries" },
  { value: "IN",  label: "India (IN)" },
  { value: "US",  label: "United States (US)" },
  { value: "UK",  label: "United Kingdom (UK)" },
  { value: "DE",  label: "Germany (DE)" },
  { value: "FR",  label: "France (FR)" },
  { value: "IT",  label: "Italy (IT)" },
  { value: "ES",  label: "Spain (ES)" },
  { value: "AE",  label: "UAE (AE)" },
];

export default function ServiceablePincodesPage() {
  const [country, setCountry] = useState<string>("IN");
  const [q, setQ]             = useState("");
  const [rows, setRows]       = useState<PincodeRow[]>([]);
  const [summary, setSummary] = useState<CountrySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ perPage: "200" });
      if (country !== "all") params.set("country", country);
      if (q.trim())          params.set("q", q.trim());
      const res = await apiFetch<{ rows: PincodeRow[]; summary: CountrySummary[] }>(
        `/api/admin/serviceable-pincodes?${params}`,
      );
      setRows(res.data.rows ?? []);
      setSummary(res.data.summary ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pincodes");
    } finally {
      setLoading(false);
    }
  }, [country, q]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Serviceable Pincodes"
        description="Configure which pincodes are deliverable per country, and where COD is enabled. Empty list = country default policy applies."
      />

      {/* Per-country summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.length === 0 && !loading && (
          <div className="col-span-full text-sm text-muted-foreground">
            No pincode rows yet. Use Add or Bulk Import below.
          </div>
        )}
        {summary.map((s) => (
          <Card key={s.country_code}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{s.country_code}</p>
                <Globe className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-1 text-2xl font-semibold">{s.total}</p>
              <p className="text-xs text-muted-foreground">
                {s.deliverable} deliverable · {s.cod_enabled} COD-on
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1">
            <Label className="text-xs">Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label className="text-xs">Search pincode / city / state</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. 400 or mumbai or Maharashtra"
                className="pl-8"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <Button onClick={() => void fetchRows()} disabled={loading} variant="outline">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <AddPincodeCard onSaved={fetchRows} defaultCountry={country !== "all" ? country : "IN"} />
          <BulkImportCard onImported={fetchRows} defaultCountry={country !== "all" ? country : "IN"} />
        </div>

        <Card className="lg:col-span-1 h-fit">
          <CardHeader className="pb-3"><CardTitle className="text-base">How this is used</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              At checkout, the customer&apos;s pincode is looked up against this table
              scoped to their country. The result combines with the country&apos;s
              <strong className="text-foreground"> pincodeEnforcement </strong>
              policy (off / permissive / strict).
            </p>
            <p>Row flags:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li><strong>is_deliverable=false</strong> — we don&apos;t ship here</li>
              <li><strong>cod_enabled=false</strong> — we ship, but no COD</li>
              <li><strong>expected_days</strong> — optional ETA hint</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Rows table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pincodes
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {rows.length} shown
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {loading && rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No pincodes for this filter. Country default policy will apply.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Country</th>
                    <th className="py-2 pr-3">Pincode</th>
                    <th className="py-2 pr-3">City</th>
                    <th className="py-2 pr-3">State</th>
                    <th className="py-2 pr-3 text-center">Deliverable</th>
                    <th className="py-2 pr-3 text-center">COD</th>
                    <th className="py-2 pr-3 text-right">ETA (days)</th>
                    <th className="py-2 pr-3 w-1" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <PincodeRowItem key={row.id} row={row} onChanged={fetchRows} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Add a single pincode

function AddPincodeCard({
  defaultCountry, onSaved,
}: {
  defaultCountry: string;
  onSaved: () => void;
}) {
  const [country, setCountry] = useState(defaultCountry);
  const [pincode, setPincode] = useState("");
  const [city, setCity]       = useState("");
  const [state, setState]     = useState("");
  const [codEnabled, setCodEnabled] = useState(true);
  const [isDeliverable, setIsDeliverable] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => { setCountry(defaultCountry); }, [defaultCountry]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/admin/serviceable-pincodes", {
        method: "POST",
        body: JSON.stringify({
          country_code:   country,
          pincode:        pincode.trim(),
          city:           city.trim()  || null,
          state:          state.trim() || null,
          is_deliverable: isDeliverable,
          cod_enabled:    codEnabled,
        }),
      });
      setPincode(""); setCity(""); setState("");
      setCodEnabled(true); setIsDeliverable(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4" />Add a single pincode
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COUNTRY_OPTIONS.filter((c) => c.value !== "all").map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pincode <span className="text-red-600">*</span></Label>
            <Input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="400001" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">City</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Mumbai" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">State</Label>
            <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="Maharashtra" />
          </div>
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isDeliverable} onChange={(e) => setIsDeliverable(e.target.checked)} />
              <span>Deliverable</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={codEnabled} onChange={(e) => setCodEnabled(e.target.checked)} />
              <span>COD enabled</span>
            </label>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={saving || pincode.trim().length < 3}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
            Add Pincode
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Bulk CSV import

function BulkImportCard({
  defaultCountry, onImported,
}: {
  defaultCountry: string;
  onImported: () => void;
}) {
  const [country, setCountry] = useState(defaultCountry);
  const [csv, setCsv]         = useState("");
  const [mode, setMode]       = useState<"upsert" | "replace_country">("upsert");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ affected: number; errors: string[] } | null>(null);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => { setCountry(defaultCountry); }, [defaultCountry]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<{ affected: number; errors: string[] }>(
        "/api/admin/serviceable-pincodes/bulk",
        {
          method: "POST",
          body: JSON.stringify({ country_code: country, csv, mode }),
        },
      );
      setResult({ affected: res.data.affected, errors: res.data.errors ?? [] });
      setCsv("");
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" />Bulk CSV import
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COUNTRY_OPTIONS.filter((c) => c.value !== "all").map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upsert">Upsert (add or update)</SelectItem>
                <SelectItem value="replace_country">Replace ALL rows for this country</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">
            CSV (header required: <code>pincode,city,state,is_deliverable,cod_enabled,expected_days,notes</code>)
          </Label>
          <Textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={`pincode,city,state,is_deliverable,cod_enabled\n400001,Mumbai,Maharashtra,true,true\n400050,Mumbai,Maharashtra,true,true`}
            className="font-mono text-xs h-36"
          />
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
        {result && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            ✓ Affected {result.affected} row(s).
            {result.errors.length > 0 && (
              <details className="mt-1 text-xs">
                <summary className="cursor-pointer">{result.errors.length} warning(s)</summary>
                <ul className="ml-4 list-disc">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={submit} disabled={submitting || csv.trim().length === 0}>
            {submitting
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing…</>
              : <><Upload className="mr-2 h-4 w-4" />Import</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Row item — inline toggle + delete

function PincodeRowItem({
  row, onChanged,
}: {
  row: PincodeRow;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"toggle-deliverable" | "toggle-cod" | "delete" | null>(null);

  async function toggle(field: "is_deliverable" | "cod_enabled") {
    setBusy(field === "is_deliverable" ? "toggle-deliverable" : "toggle-cod");
    try {
      await apiFetch(`/api/admin/serviceable-pincodes/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: !row[field] }),
      });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${row.country_code} ${row.pincode}? This affects checkout availability immediately.`)) return;
    setBusy("delete");
    try {
      await apiFetch(`/api/admin/serviceable-pincodes/${row.id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="py-2 pr-3 font-medium">{row.country_code}</td>
      <td className="py-2 pr-3 font-mono">{row.pincode}</td>
      <td className="py-2 pr-3">{row.city ?? "—"}</td>
      <td className="py-2 pr-3">{row.state ?? "—"}</td>
      <td className="py-2 pr-3 text-center">
        <button
          onClick={() => void toggle("is_deliverable")}
          disabled={busy !== null}
          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
            row.is_deliverable
              ? "bg-green-100 text-green-800 hover:bg-green-200"
              : "bg-red-100 text-red-800 hover:bg-red-200"
          }`}
        >
          {busy === "toggle-deliverable" ? <Loader2 className="h-3 w-3 animate-spin" /> : (row.is_deliverable ? "Yes" : "No")}
        </button>
      </td>
      <td className="py-2 pr-3 text-center">
        <button
          onClick={() => void toggle("cod_enabled")}
          disabled={busy !== null}
          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
            row.cod_enabled
              ? "bg-green-100 text-green-800 hover:bg-green-200"
              : "bg-amber-100 text-amber-800 hover:bg-amber-200"
          }`}
        >
          {busy === "toggle-cod" ? <Loader2 className="h-3 w-3 animate-spin" /> : (row.cod_enabled ? "Yes" : "No")}
        </button>
      </td>
      <td className="py-2 pr-3 text-right">{row.expected_days ?? "—"}</td>
      <td className="py-2 pr-3">
        <Button size="sm" variant="ghost" onClick={remove} disabled={busy !== null}>
          {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </td>
    </tr>
  );
}
