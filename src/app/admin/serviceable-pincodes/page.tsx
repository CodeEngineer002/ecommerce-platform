"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle, ChevronLeft, ChevronRight, Info, Loader2, MapPin, Pencil,
  RefreshCw, Search, Trash2, Upload, X,
} from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function ServiceablePincodesPage() {
  const [country, setCountry] = useState<string>("IN");
  const [q, setQ]             = useState("");
  const [rows, setRows]       = useState<PincodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [page, setPage]       = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset to page 1 whenever filters change or row count shrinks below current page
  useEffect(() => { setPage(1); }, [country, q]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const startIdx   = (safePage - 1) * pageSize;
  const endIdx     = Math.min(startIdx + pageSize, rows.length);
  const pageRows   = rows.slice(startIdx, endIdx);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ perPage: "200" });
      if (country !== "all") params.set("country", country);
      if (q.trim())          params.set("q", q.trim());
      const res = await apiFetch<{ rows: PincodeRow[] }>(
        `/api/admin/serviceable-pincodes?${params}`,
      );
      setRows(res.data.rows ?? []);
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

      {/* How-this-is-used info banner */}
      <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="space-y-1">
          <p>
            At checkout, the customer&apos;s pincode is looked up against this table scoped to their country.
            The result combines with the country&apos;s <strong>pincodeEnforcement</strong> policy (off / permissive / strict).
          </p>
          <p className="text-xs text-blue-800">
            <strong>is_deliverable=false</strong> blocks shipping ·{" "}
            <strong>cod_enabled=false</strong> allows shipping but disables COD ·{" "}
            <strong>expected_days</strong> is an optional ETA hint.
          </p>
        </div>
      </div>

      {/* Add / Bulk import tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="add">
            <TabsList>
              <TabsTrigger value="add" className="gap-2">
                <MapPin className="h-4 w-4" />Add a single pincode
              </TabsTrigger>
              <TabsTrigger value="bulk" className="gap-2">
                <Upload className="h-4 w-4" />Bulk CSV import
              </TabsTrigger>
            </TabsList>

            <TabsContent value="add" className="mt-4">
              <AddPincodeForm
                defaultCountry={country !== "all" ? country : "IN"}
                onSaved={fetchRows}
              />
            </TabsContent>

            <TabsContent value="bulk" className="mt-4">
              <BulkImportForm
                defaultCountry={country !== "all" ? country : "IN"}
                onImported={fetchRows}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

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

      {/* Full-width Pincodes table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pincodes
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {rows.length} total
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
                    <th className="py-2 pr-3">Notes</th>
                    <th className="py-2 pr-3 w-24 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2 pr-3"><Skeleton className="h-4 w-8" /></td>
                      <td className="py-2 pr-3"><Skeleton className="h-4 w-16" /></td>
                      <td className="py-2 pr-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="py-2 pr-3"><Skeleton className="h-4 w-28" /></td>
                      <td className="py-2 pr-3"><Skeleton className="h-5 w-10 mx-auto rounded" /></td>
                      <td className="py-2 pr-3"><Skeleton className="h-5 w-10 mx-auto rounded" /></td>
                      <td className="py-2 pr-3"><Skeleton className="h-4 w-6 ml-auto" /></td>
                      <td className="py-2 pr-3"><Skeleton className="h-4 w-32" /></td>
                      <td className="py-2 pr-3"><Skeleton className="h-7 w-16 ml-auto" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No pincodes for this filter. Country default policy will apply.
            </p>
          ) : (
            <>
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
                      <th className="py-2 pr-3">Notes</th>
                      <th className="py-2 pr-3 w-24 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <PincodeRowItem key={row.id} row={row} onChanged={fetchRows} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination footer */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>
                    Showing <strong className="text-foreground">{startIdx + 1}</strong>–
                    <strong className="text-foreground">{endIdx}</strong> of{" "}
                    <strong className="text-foreground">{rows.length}</strong>
                  </span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-muted-foreground">
                    Page <strong className="text-foreground">{safePage}</strong> of{" "}
                    <strong className="text-foreground">{totalPages}</strong>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Add a single pincode (form-only, no card wrapper — tab content provides it)

function AddPincodeForm({
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
    <div>
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
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Bulk CSV import (form-only)

function BulkImportForm({
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
    <div className="space-y-3">
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
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Row item — view mode (inline toggles + edit/delete) or edit mode (all fields)

interface EditableFields {
  city:           string;
  state:          string;
  is_deliverable: boolean;
  cod_enabled:    boolean;
  expected_days:  string; // string for clean empty handling, parsed on save
  notes:          string;
}

function fieldsFromRow(row: PincodeRow): EditableFields {
  return {
    city:           row.city  ?? "",
    state:          row.state ?? "",
    is_deliverable: row.is_deliverable,
    cod_enabled:    row.cod_enabled,
    expected_days:  row.expected_days != null ? String(row.expected_days) : "",
    notes:          row.notes ?? "",
  };
}

function PincodeRowItem({
  row, onChanged,
}: {
  row: PincodeRow;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"toggle-deliverable" | "toggle-cod" | "delete" | "save" | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<EditableFields>(() => fieldsFromRow(row));
  const [editError, setEditError] = useState<string | null>(null);

  // Keep draft in sync when row data refreshes from parent (after save/toggle)
  useEffect(() => { if (!editing) setDraft(fieldsFromRow(row)); }, [row, editing]);

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

  function startEdit() {
    setDraft(fieldsFromRow(row));
    setEditError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(fieldsFromRow(row));
    setEditError(null);
    setEditing(false);
  }

  async function saveEdit() {
    setEditError(null);

    // expected_days: empty → null; otherwise parse + validate
    let expectedDays: number | null = null;
    if (draft.expected_days.trim() !== "") {
      const n = Number(draft.expected_days);
      if (!Number.isInteger(n) || n < 1 || n > 60) {
        setEditError("ETA (days) must be an integer between 1 and 60, or empty.");
        return;
      }
      expectedDays = n;
    }

    setBusy("save");
    try {
      await apiFetch(`/api/admin/serviceable-pincodes/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          city:           draft.city.trim()  || null,
          state:          draft.state.trim() || null,
          is_deliverable: draft.is_deliverable,
          cod_enabled:    draft.cod_enabled,
          expected_days:  expectedDays,
          notes:          draft.notes.trim() || null,
        }),
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  if (editing) {
    return (
      <tr className="border-b bg-muted/30">
        <td className="py-2 pr-3 font-medium align-top">{row.country_code}</td>
        <td className="py-2 pr-3 font-mono align-top">{row.pincode}</td>
        <td className="py-2 pr-3 align-top">
          <Input
            value={draft.city}
            onChange={(e) => setDraft({ ...draft, city: e.target.value })}
            placeholder="City"
            className="h-8 text-sm"
          />
        </td>
        <td className="py-2 pr-3 align-top">
          <Input
            value={draft.state}
            onChange={(e) => setDraft({ ...draft, state: e.target.value })}
            placeholder="State"
            className="h-8 text-sm"
          />
        </td>
        <td className="py-2 pr-3 text-center align-top">
          <input
            type="checkbox"
            checked={draft.is_deliverable}
            onChange={(e) => setDraft({ ...draft, is_deliverable: e.target.checked })}
          />
        </td>
        <td className="py-2 pr-3 text-center align-top">
          <input
            type="checkbox"
            checked={draft.cod_enabled}
            onChange={(e) => setDraft({ ...draft, cod_enabled: e.target.checked })}
          />
        </td>
        <td className="py-2 pr-3 align-top">
          <Input
            type="number"
            min={1}
            max={60}
            value={draft.expected_days}
            onChange={(e) => setDraft({ ...draft, expected_days: e.target.value })}
            placeholder="—"
            className="h-8 w-20 text-sm text-right"
          />
        </td>
        <td className="py-2 pr-3 align-top">
          <Input
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="Internal notes"
            className="h-8 text-sm"
          />
          {editError && <p className="mt-1 text-xs text-red-700">{editError}</p>}
        </td>
        <td className="py-2 pr-3 align-top">
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={busy === "save"}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveEdit} disabled={busy === "save"}>
              {busy === "save"
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <CheckCircle className="h-4 w-4" />}
            </Button>
          </div>
        </td>
      </tr>
    );
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
      <td className="py-2 pr-3 max-w-[14rem] truncate text-muted-foreground" title={row.notes ?? undefined}>
        {row.notes ?? "—"}
      </td>
      <td className="py-2 pr-3">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={startEdit} disabled={busy !== null} title="Edit row">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={remove} disabled={busy !== null} title="Delete row">
            {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
      </td>
    </tr>
  );
}
