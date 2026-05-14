import { Badge } from "@/components/ui/badge";
import { ORDER_STATUSES } from "@/lib/constants";
import type { OrderStatus } from "@/types";

const variantMap: Record<string, "default" | "success" | "warning" | "destructive" | "info" | "secondary"> = {
  green: "success",
  yellow: "warning",
  red: "destructive",
  blue: "info",
  purple: "secondary",
  gray: "secondary",
};

interface StatusBadgeProps {
  status: OrderStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = ORDER_STATUSES[status] ?? { label: status.replace(/_/g, " "), color: "gray" };
  return (
    <Badge variant={variantMap[config.color] ?? "default"}>
      {config.label}
    </Badge>
  );
}
