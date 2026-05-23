"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, CheckCircle, Loader2, RefreshCw, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/utils";

type Status = "pending" | "reconciled" | "variance";

interface Row {
  id:                  string;
  date:                string;
  agent_id:            string | null;
  total_collected:     number;
  order_count:         number;
  bank_deposit_amount: number | null;
  bank_deposit_ref:    string | null;
  deposited_at:        string | null;
  status:              Status;
  variance_amount:     number;
  notes:               string | null;
}

const STATUS_FILTERS: { value: Status | "all"; label: string }[] = [
  { value: "all",        label: "All" },
  { value: "pending",    label: "Pending" },
  { value: "reconciled", label: "Reconciled" },
  { value: "variance",   label: "Variance" },
];

function StatusBadge({ status }: { status: Status }) {
  if (status === "reconciled") {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
        <CheckCircle className="mr-1 h-3 w-3" />
        Reconciled
      </Badge>
    );
  }
  if (status === "variance") {
    return (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
        <TriangleAlert className="mr-1 h-3 w-3" />
        Variance
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-300 text-amber-800">
      Pending
    </Badge>
  );
}

function todayISO()      { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(d: number) {
  return new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
}

export default function CodReconciliationPage() {
  const [from, setFrom]               = useState<string>(daysAgoISO(30));
  const [to, setTo]                   = useState<string>(todayISO());
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [rows, setRows]               = useState<Row[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to, status: statusFilter });
      const res = await apiFetch<{ rows: Row[] }>(`/api/admin/cod-reconciliation?${qs}`);
      setRows(res.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reconciliation");
    } finally {
      setLoading(false);
    }
  }, [from, to, statusFilter]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  // Totals across visible rows
  const totalCollected = rows.reduce((s, r) => s + Number(r.total_collected), 0);
  const totalDeposited = rows.reduce((s, r) => s + Number(r.bank_deposit_amount ?? 0), 0);
  const totalOrders    = rows.reduce((s, r) => s + r.order_count, 0);
  const totalVariance  = totalDeposited - totalCollected;

  return (
    <div className="space-y-6">
      <PageHeader
        title="COD Cash Reconciliation"
        description="Daily rollup of cash collected vs. bank deposits"
      />

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs">From</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs">To</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex gap-1">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={statusFilter === f.value ? "default" : "outline"}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchRows()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardContent>
      </Card>

      {/* Aggregate totals across visible rows */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <SummaryCard label="Collected"  value={formatPrice(totalCollected)} icon={<Banknote />} />
        <SummaryCard label="Deposited"  value={formatPrice(totalDeposited)} />
        <SummaryCard label="Orders"     value={String(totalOrders)} />
        <SummaryCard
          label="Variance"
          value={formatPrice(totalVariance)}
          tone={Math.abs(totalVariance) < 0.01 ? "ok" : "warn"}
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily rollup</CardTitle>
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
              No reconciliation rows in this range.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Agent</th>
                    <th className="py-2 pr-3 text-right">Collected</th>
                    <th className="py-2 pr-3 text-right">Orders</th>
                    <th className="py-2 pr-3 text-right">Deposited</th>
                    <th className="py-2 pr-3 text-right">Variance</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 w-1" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <ReconciliationRow key={row.id} row={row} onSaved={fetchRows} />
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

function SummaryCard({
  label, value, tone, icon,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
  icon?: React.ReactNode;
}) {
  const toneClass = tone === "warn" ? "text-red-700" : tone === "ok" ? "text-green-700" : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase text-muted-foreground">{label}</p>
          {icon && <span className="text-muted-foreground">{icon}</span>}
        </div>
        <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ReconciliationRow({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const [editing, setEditing]         = useState(false);
  const [deposit, setDeposit]         = useState<string>(row.bank_deposit_amount?.toString() ?? "");
  const [ref, setRef]                 = useState<string>(row.bank_deposit_ref ?? "");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  async function save(newStatus?: Status) {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/cod-reconciliation`, {
        method: "PATCH",
        body: JSON.stringify({
          id:                  row.id,
          bank_deposit_amount: deposit === "" ? null : Number(deposit),
          bank_deposit_ref:    ref || null,
          deposited_at:        deposit !== "" ? new Date().toISOString() : null,
          status:              newStatus,
        }),
      });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const agentLabel = row.agent_id ? row.agent_id.slice(0, 8) + "…" : "system";

  return (
    <>
      <tr className="border-b">
        <td className="py-2 pr-3 font-medium">{row.date}</td>
        <td className="py-2 pr-3 text-xs text-muted-foreground">{agentLabel}</td>
        <td className="py-2 pr-3 text-right">{formatPrice(Number(row.total_collected))}</td>
        <td className="py-2 pr-3 text-right">{row.order_count}</td>
        <td className="py-2 pr-3 text-right">
          {row.bank_deposit_amount == null ? "—" : formatPrice(Number(row.bank_deposit_amount))}
        </td>
        <td className={`py-2 pr-3 text-right ${row.variance_amount < 0 ? "text-red-700" : row.variance_amount > 0 ? "text-amber-700" : ""}`}>
          {formatPrice(Number(row.variance_amount))}
        </td>
        <td className="py-2 pr-3"><StatusBadge status={row.status} /></td>
        <td className="py-2 pr-3">
          <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Edit"}
          </Button>
        </td>
      </tr>
      {editing && (
        <tr className="border-b bg-muted/30">
          <td colSpan={8} className="px-3 py-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Deposit amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  className="w-36"
                />
              </div>
              <div className="space-y-1 flex-1 min-w-[200px]">
                <Label className="text-xs">Bank reference</Label>
                <Input
                  placeholder="e.g. NEFT-2026-05-23-001"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                />
              </div>
              <Button onClick={() => save("reconciled")} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark Reconciled"}
              </Button>
              <Button
                variant="outline"
                onClick={() => save("variance")}
                disabled={saving}
                className="border-red-300 text-red-700"
              >
                Flag Variance
              </Button>
              {error && <p className="w-full text-xs text-red-700">{error}</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
