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
  /** Gross line value before any discount allocation (unitPrice × quantity). */
  grossLineTotal: number;
  /** Portion of the order-level discount allocated to this line, pro-rated by gross. */
  discountAllocated: number;
  /** What the customer actually paid for this line (gross − discountAllocated). */
  lineTotal: number;
}

export interface RefundCalculation {
  lines: RefundLineItem[];
  /** Gross items value before discount. */
  itemsGross: number;
  /** Total order-level discount allocated to the refunded lines. */
  discountAllocated: number;
  /** Net items value the customer actually paid (itemsGross − discountAllocated). */
  itemsTotal: number;
  /** Pro-rated shipping to refund — only on full refund or if explicitly requested. */
  shippingRefund: number;
  /** Pro-rated tax on refunded items (computed against the taxable base, which is subtotal − discount). */
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
  /**
   * Order-level discount AMOUNT (already applied to total).
   * Defaults to 0 for callers that haven't been updated yet — those callers
   * will produce the old gross-refund behaviour. New callers MUST pass this.
   */
  orderDiscount?: number;
  orderTotal: number;
  /** Set true to include shipping in refund amount. */
  refundShipping?: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calculates refund amount for selected items.
 *
 * **Discount handling (Path-A PE-1 fix):**
 *   If the order had an order-level discount (e.g. ₹200 coupon on a ₹1000
 *   order), each refund line gets a pro-rated share of that discount
 *   subtracted from its gross. Without this, a customer returning a
 *   discounted item would be refunded the gross price — which is MORE than
 *   they paid.
 *
 * **Tax handling:**
 *   Tax was charged on the post-discount subtotal (subtotal − discount).
 *   We pro-rate tax against the same base so refunds round-trip cleanly.
 */
export function calculateRefund(input: RefundCalculatorInput): RefundCalculation {
  const {
    items,
    refundItems,
    orderSubtotal,
    orderShipping,
    orderTax,
    orderDiscount = 0,
    orderTotal,
    refundShipping = false,
  } = input;

  const itemMap = new Map(items.map((i) => [i.orderItemId, i]));

  // First pass: validate + compute gross per line.
  const linesGross = refundItems.map((ri) => {
    const item = itemMap.get(ri.orderItemId);
    if (!item) throw new Error(`Item ${ri.orderItemId} not found in order`);

    const maxRefundable = item.quantity - (item.returnedQuantity ?? 0);
    if (ri.quantity > maxRefundable) {
      throw new Error(
        `Cannot refund ${ri.quantity} of item ${ri.orderItemId} — only ${maxRefundable} refundable`,
      );
    }
    const gross = round2(ri.quantity * item.unitPrice);
    return { ri, item, gross };
  });

  const itemsGross = round2(linesGross.reduce((s, l) => s + l.gross, 0));

  // Discount allocation per line: pro-rate the order-level discount against
  // gross. Allocation ratio is (line.gross / orderSubtotal), so refunding
  // 100% of items refunds 100% of discount; refunding 30% of gross refunds
  // ~30% of discount.
  const discountAllocator =
    orderSubtotal > 0 && orderDiscount > 0 ? orderDiscount / orderSubtotal : 0;

  const lines: RefundLineItem[] = linesGross.map(({ ri, item, gross }) => {
    const discountAllocated = round2(gross * discountAllocator);
    const lineTotal = round2(gross - discountAllocated);
    return {
      orderItemId:       ri.orderItemId,
      quantity:          ri.quantity,
      unitPrice:         item.unitPrice,
      grossLineTotal:    gross,
      discountAllocated,
      lineTotal,
    };
  });

  const discountAllocated = round2(lines.reduce((s, l) => s + l.discountAllocated, 0));
  const itemsTotal        = round2(itemsGross - discountAllocated);

  // Tax was charged on (subtotal − discount). Pro-rate refund against the
  // same base so partial refunds round-trip exactly.
  const taxableBase = round2(orderSubtotal - orderDiscount);
  const taxRefund =
    taxableBase > 0 ? round2((itemsTotal / taxableBase) * orderTax) : 0;

  const shippingRefund = refundShipping ? orderShipping : 0;

  // Hard cap at orderTotal — refund can never exceed what was paid.
  const totalRefund = Math.min(
    round2(itemsTotal + taxRefund + shippingRefund),
    orderTotal,
  );

  const isFullRefund = totalRefund >= orderTotal;
  const refundType: RefundCalculation["refundType"] =
    isFullRefund ? "full" : shippingRefund > 0 && itemsTotal === 0 ? "shipping" : "partial";

  return {
    lines,
    itemsGross,
    discountAllocated,
    itemsTotal,
    shippingRefund,
    taxRefund,
    totalRefund,
    refundType,
  };
}

/**
 * Quick helper: maximum refundable amount for an order (total minus already-refunded).
 */
export function maxRefundable(orderTotal: number, alreadyRefunded: number): number {
  return Math.max(0, orderTotal - alreadyRefunded);
}
