"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  revenueByDay:   { date: string; revenue: number }[];
  topProducts:    { product_name: string; units_sold: number; revenue: number }[];
  conversionRate: { carts: number; orders: number; rate: number };
  summary:        { totalRevenue: number; totalOrders: number; avgOrderValue: number };
  dateRange:      { from: string; to: string };
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchAnalytics(from: string, to: string): Promise<AnalyticsData> {
  const res = await apiFetch(`/api/admin/analytics?from=${from}&to=${to}`);
  return (res as { data: AnalyticsData }).data;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const PRESETS = [
  { label: "Last 7d",  days: 7 },
  { label: "Last 30d", days: 30 },
  { label: "Last 90d", days: 90 },
];

// ── Chart custom tooltip ──────────────────────────────────────────────────────

function RevenueTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="text-muted-foreground">{label ? shortDate(label) : ""}</p>
      <p className="font-bold">{formatPrice(payload[0].value)}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AnalyticsDashboard() {
  const today     = new Date();
  const thirtyAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [fromDate, setFromDate] = useState(toDateInputValue(thirtyAgo));
  const [toDate,   setToDate]   = useState(toDateInputValue(today));

  // Convert date-picker values to ISO (start/end of day)
  const fromISO = `${fromDate}T00:00:00.000Z`;
  const toISO   = `${toDate}T23:59:59.999Z`;

  const { data, isLoading, refetch } = useQuery<AnalyticsData>({
    queryKey: ["admin", "analytics", fromDate, toDate],
    queryFn:  () => fetchAnalytics(fromISO, toISO),
    staleTime: 60 * 1000,
  });

  function applyPreset(days: number) {
    const t = new Date();
    const f = new Date(t.getTime() - days * 24 * 60 * 60 * 1000);
    setFromDate(toDateInputValue(f));
    setToDate(toDateInputValue(t));
  }

  // ── Summary stats ──────────────────────────────────────────────────────────
  const summary = data?.summary;
  const conversion = data?.conversionRate;

  return (
    <div className="space-y-6">

      {/* ── Date range controls ──────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="from-date">From</Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to-date">To</Label>
              <Input
                id="to-date"
                type="date"
                value={toDate}
                min={fromDate}
                max={toDateInputValue(new Date())}
                onChange={(e) => setToDate(e.target.value)}
                className="w-40"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Apply
            </Button>
            <div className="ml-auto flex gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  variant="ghost"
                  size="sm"
                  onClick={() => applyPreset(p.days)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI row ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Revenue"
          value={summary ? formatPrice(summary.totalRevenue) : undefined}
          sub="In date range"
          loading={isLoading}
        />
        <KpiCard
          title="Orders"
          value={summary ? String(summary.totalOrders) : undefined}
          sub="Non-draft / failed"
          loading={isLoading}
        />
        <KpiCard
          title="Avg Order Value"
          value={summary ? formatPrice(summary.avgOrderValue) : undefined}
          sub="Revenue ÷ orders"
          loading={isLoading}
        />
        <KpiCard
          title="Conversion Rate"
          value={conversion ? `${conversion.rate}%` : undefined}
          sub={conversion ? `${conversion.orders} orders / ${conversion.carts} carts` : "Carts → Orders"}
          loading={isLoading}
        />
      </div>

      {/* ── Revenue line chart ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={264}>
              <AreaChart
                data={data?.revenueByDay ?? []}
                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#4f46e5" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v: number) => `₹${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />
                <Tooltip content={<RevenueTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Top products bar chart ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Top 5 Products by Units Sold</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (data?.topProducts?.length ?? 0) === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No product sales data for this period
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={data?.topProducts ?? []}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="product_name"
                  width={160}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + "…" : v}
                />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === "units_sold"
                      ? [`${value} units`, "Units sold"]
                      : [formatPrice(value), "Revenue"]
                  }
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="units_sold" fill="#4f46e5" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Conversion funnel ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Cart → Order Conversion</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="flex flex-wrap items-center gap-8">
              <FunnelStep label="Carts created" value={conversion?.carts ?? 0} color="bg-violet-200" />
              <span className="text-2xl text-muted-foreground">→</span>
              <FunnelStep label="Orders placed" value={conversion?.orders ?? 0} color="bg-indigo-400" />
              <div className="ml-auto text-right">
                <p className="text-3xl font-bold text-primary">{conversion?.rate ?? 0}%</p>
                <p className="text-xs text-muted-foreground">Conversion rate</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  sub,
  loading,
}: {
  title:   string;
  value?:  string;
  sub:     string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="text-2xl font-bold">{value ?? "—"}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function FunnelStep({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-10 w-10 rounded-full ${color} flex items-center justify-center`}>
        <span className="text-sm font-bold text-white">{value >= 1000 ? `${Math.round(value / 1000)}k` : value}</span>
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
