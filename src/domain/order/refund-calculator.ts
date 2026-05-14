// Pure refund calculation — no DB calls, no side effects.

export interface RefundableItem {
  orderItemId: string;
  quantity: number;
  unitPrice: number;
  returnedQuantity?: number; // already-returned quantity on this item
}

export interface RefundLineItem {
  orderItemId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface RefundCalculation {
  lines: RefundLineItem[];
  itemsTotal: number;
  /** Pro-rated shipping to refund — only on full refund or if explicitly requested. */
  shippingRefund: number;
  /** Pro-rated tax on refunded items. */
  taxRefund: number;
  totalRefund: number;
  refundType: "full" | "partial" | "shipping";
}

export interface RefundCalculatorInput {
  items: RefundableItem[];
  /** The specific items being refunded (subset of items). */
  refundItems: { orderItemId: string; quantity: number }[];
  orderSubtotal: number;
  orderShipping: number;
  orderTax: number;
  orderTotal: number;
  /** Set true to include shipping in refund amount. */
  refundShipping?: boolean;
}

export function calculateRefund(input: RefundCalculatorInput): RefundCalculation {
  const {
    items,
    refundItems,
    orderSubtotal,
    orderShipping,
    orderTax,
    orderTotal,
    refundShipping = false,
  } = input;

  const itemMap = new Map(items.map((i) => [i.orderItemId, i]));

  const lines: RefundLineItem[] = refundItems.map((ri) => {
    const item = itemMap.get(ri.orderItemId);
    if (!item) throw new Error(`Item ${ri.orderItemId} not found in order`);

    const maxRefundable = item.quantity - (item.returnedQuantity ?? 0);
    if (ri.quantity > maxRefundable) {
      throw new Error(
        `Cannot refund ${ri.quantity} of item ${ri.orderItemId} — only ${maxRefundable} refundable`,
      );
    }

    return {
      orderItemId: ri.orderItemId,
      quantity: ri.quantity,
      unitPrice: item.unitPrice,
      lineTotal: ri.quantity * item.unitPrice,
    };
  });

  const itemsTotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  // Tax is proportional to the fraction of the subtotal being refunded
  const taxRefund =
    orderSubtotal > 0 ? Math.round(((itemsTotal / orderSubtotal) * orderTax) * 100) / 100 : 0;

  const shippingRefund = refundShipping ? orderShipping : 0;

  const totalRefund = Math.min(itemsTotal + taxRefund + shippingRefund, orderTotal);

  const isFullRefund = totalRefund >= orderTotal;
  const refundType: RefundCalculation["refundType"] =
    isFullRefund ? "full" : shippingRefund > 0 && itemsTotal === 0 ? "shipping" : "partial";

  return { lines, itemsTotal, shippingRefund, taxRefund, totalRefund, refundType };
}

/**
 * Quick helper: maximum refundable amount for an order (total minus already-refunded).
 */
export function maxRefundable(orderTotal: number, alreadyRefunded: number): number {
  return Math.max(0, orderTotal - alreadyRefunded);
}
