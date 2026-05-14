import { TAX_RATE } from "@/lib/constants";

export interface RefundOrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ReturnItem {
  orderItemId: string;
  quantity: number;
}

export interface RefundCalculationInput {
  orderSubtotal: number;
  orderShipping: number;
  orderTaxRate?: number;
  orderItems: RefundOrderItem[];
  returnItems: ReturnItem[];
  /** Restocking fee as a decimal (e.g. 0.05 = 5%). Default: 0 */
  restockingFeeRate?: number;
  /** Whether to refund shipping when ALL items are returned */
  refundShippingOnFullReturn?: boolean;
}

export interface RefundLineItem {
  orderItemId: string;
  quantity: number;
  unitPrice: number;
  subtotalRefund: number;
  restockingFee: number;
  netRefund: number;
}

export interface RefundCalculation {
  lineItems: RefundLineItem[];
  subtotalRefund: number;
  restockingFeeTotal: number;
  taxRefund: number;
  shippingRefund: number;
  totalRefund: number;
  isFullReturn: boolean;
}

/**
 * Pure calculation for refund amounts.
 * No side effects, no DB access — can be used both server-side and in tests.
 *
 * Tax is re-calculated proportionally on the returnable subtotal.
 * Shipping is only refunded on full returns (configurable).
 */
export function calculateRefund(input: RefundCalculationInput): RefundCalculation {
  const {
    orderSubtotal: _orderSubtotal,
    orderShipping,
    orderTaxRate = TAX_RATE,
    orderItems,
    returnItems,
    restockingFeeRate = 0,
    refundShippingOnFullReturn = true,
  } = input;

  const lineItems: RefundLineItem[] = [];
  let subtotalRefund = 0;
  let restockingFeeTotal = 0;

  for (const returnItem of returnItems) {
    const orderItem = orderItems.find((i) => i.id === returnItem.orderItemId);
    if (!orderItem) continue;

    const returnableQty = Math.min(returnItem.quantity, orderItem.quantity);
    const unitPrice = orderItem.unitPrice;
    const gross = round2(unitPrice * returnableQty);
    const restockingFee = round2(gross * restockingFeeRate);
    const net = round2(gross - restockingFee);

    lineItems.push({
      orderItemId: returnItem.orderItemId,
      quantity: returnableQty,
      unitPrice,
      subtotalRefund: gross,
      restockingFee,
      netRefund: net,
    });

    subtotalRefund += gross;
    restockingFeeTotal += restockingFee;
  }

  subtotalRefund = round2(subtotalRefund);
  restockingFeeTotal = round2(restockingFeeTotal);

  const netSubtotalRefund = round2(subtotalRefund - restockingFeeTotal);
  const taxRefund = round2(netSubtotalRefund * orderTaxRate);

  // Check if this is a full return
  const totalReturnedQty = returnItems.reduce((s, r) => s + r.quantity, 0);
  const totalOrderedQty = orderItems.reduce((s, i) => s + i.quantity, 0);
  const isFullReturn = totalReturnedQty >= totalOrderedQty;

  const shippingRefund =
    isFullReturn && refundShippingOnFullReturn ? orderShipping : 0;

  const totalRefund = round2(netSubtotalRefund + taxRefund + shippingRefund);

  return {
    lineItems,
    subtotalRefund,
    restockingFeeTotal,
    taxRefund,
    shippingRefund,
    totalRefund: Math.max(0, totalRefund),
    isFullReturn,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
