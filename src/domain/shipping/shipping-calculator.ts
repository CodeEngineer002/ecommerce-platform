import { FREE_SHIPPING_THRESHOLD, SHIPPING_COST } from "@/lib/constants";

export interface ShippingRate {
  cost: number;
  label: string;
  estimatedDays: number | null;
}

export interface ShippingContext {
  subtotal: number;
}

export type ShippingStrategy = (ctx: ShippingContext) => ShippingRate;

export const flatRateStrategy: ShippingStrategy = (ctx) =>
  ctx.subtotal >= FREE_SHIPPING_THRESHOLD
    ? { cost: 0, label: "Free Shipping", estimatedDays: 5 }
    : { cost: SHIPPING_COST, label: "Standard Shipping", estimatedDays: 5 };

export function calculateShipping(
  ctx: ShippingContext,
  strategy: ShippingStrategy = flatRateStrategy,
): ShippingRate {
  return strategy(ctx);
}
