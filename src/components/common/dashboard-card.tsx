import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ── Icon colour variants ───────────────────────────────────────────────────

const iconVariants = cva("h-5 w-5 shrink-0", {
  variants: {
    color: {
      default: "text-primary",
      green: "text-green-600",
      blue: "text-blue-600",
      purple: "text-purple-600",
      orange: "text-orange-600",
      red: "text-destructive",
      yellow: "text-yellow-600",
      pink: "text-pink-600",
    },
  },
  defaultVariants: {
    color: "default",
  },
});

// ── Props ─────────────────────────────────────────────────────────────────

interface DashboardCardProps extends VariantProps<typeof iconVariants> {
  title: string;
  value: string | number;
  icon: LucideIcon;
  /**
   * Optional trend indicator.
   * Positive `value` shows an upward arrow in green; negative shows red.
   */
  trend?: {
    value: number;
    label: string;
  };
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────

export function DashboardCard({
  title,
  value,
  icon: Icon,
  trend,
  color,
  className,
}: DashboardCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={cn(iconVariants({ color }))} aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {trend && (
          <p
            className={cn(
              "mt-1 text-xs",
              trend.value >= 0 ? "text-green-600" : "text-destructive"
            )}
          >
            <span aria-hidden="true">{trend.value >= 0 ? "↑" : "↓"}</span>{" "}
            <span className="sr-only">{trend.value >= 0 ? "Up" : "Down"}</span>
            {Math.abs(trend.value)}% {trend.label}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
