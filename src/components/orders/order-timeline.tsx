import { CheckCircle2, Circle, XCircle } from "lucide-react";
import type { OrderStatus } from "@/domain/order/order-state-machine";
import { ORDER_JOURNEY, TRACK_STEPS } from "@/domain/order/order-journey";

interface Props {
  status: OrderStatus;
}

export function OrderTimeline({ status }: Props) {
  const journey = ORDER_JOURNEY[status];
  if (!journey) return null;

  const steps   = TRACK_STEPS[journey.track];
  const current = journey.step;
  const isRejected =
    status === "return_rejected" ||
    status === "replacement_rejected" ||
    status === "cancelled" ||
    status === "failed";

  return (
    <div className="relative">
      {/* Vertical connector line */}
      <div className="absolute left-[13px] top-4 bottom-4 w-px bg-border" />

      <ol className="space-y-5">
        {steps.map((label, i) => {
          const done    = i < current;
          const active  = i === current;
          const pending = i > current;

          const stepRejected = isRejected && active;

          return (
            <li key={label} className="relative flex items-start gap-3 pl-8">
              {/* Step icon */}
              <div className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-full bg-background ring-1 ring-border">
                {stepRejected ? (
                  <XCircle className="h-4 w-4 text-destructive" />
                ) : done ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : active ? (
                  <div className="h-3 w-3 rounded-full bg-primary ring-2 ring-primary/30" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/30" />
                )}
              </div>

              {/* Step label + hint */}
              <div className="pt-0.5">
                <p
                  className={`text-sm font-medium ${
                    active && !stepRejected
                      ? "text-foreground"
                      : done
                        ? "text-foreground"
                        : stepRejected
                          ? "text-destructive"
                          : "text-muted-foreground"
                  }`}
                >
                  {label}
                </p>
                {active && !stepRejected && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{journey.hint}</p>
                )}
                {stepRejected && (
                  <p className="mt-0.5 text-xs text-destructive">{journey.hint}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
