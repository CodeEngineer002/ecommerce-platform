export interface LineItem {
  variantId: string;
  quantity: number;
  unitPrice: number;
  productName: string;
}

export interface CouponData {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  maxDiscount: number | null;
  minOrderValue: number | null;
}

export interface ShippingConfig {
  freeThreshold: number;
  flatRate: number;
}

export interface TaxConfig {
  rate: number;
}

export interface PriceBreakdown {
  subtotal: number;
  discount: number;
  taxableAmount: number;
  tax: number;
  shipping: number;
  total: number;
}
