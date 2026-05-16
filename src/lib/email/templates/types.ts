/** Shared data shapes passed into email templates. */

export interface EmailOrderItem {
  product_name: string;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
}

export interface EmailAddress {
  full_name?: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country: string;
}

export interface EmailOrderSummary {
  order_number: string;
  created_at: string;
  items: EmailOrderItem[];
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  currency_code: string;
  shipping_address: EmailAddress;
  payment_provider?: string;
}
