import { Banknote } from "lucide-react";

import { formatPrice } from "@/lib/utils";

interface Props {
  amount:        number;
  currencyCode?: string;
  /** Compact variant for inline placement next to the order summary. */
  compact?:      boolean;
}

/**
 * Customer-facing banner that explains the pending COD payment in plain
 * English instead of the raw enum text "cod_pending_collection".
 *
 * Render when payment.provider === "cod" && payment.status === "cod_pending_collection".
 */
export function CodDueBanner({ amount, currencyCode = "INR", compact = false }: Props) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-700/50 dark:bg-amber-900/20">
        <Banknote className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
        <span className="text-amber-800 dark:text-amber-200">
          Pay <strong>{formatPrice(amount, currencyCode)}</strong> in cash on delivery
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/50 dark:bg-amber-900/20">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100">
          <Banknote className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Cash on Delivery — {formatPrice(amount, currencyCode)} due
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            Please keep the exact amount ready for the delivery agent. You&rsquo;ll receive a
            payment receipt by email once cash is collected.
          </p>
        </div>
      </div>
    </div>
  );
}
