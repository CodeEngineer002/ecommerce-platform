import { Hr, Link, Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailLayout, styles } from "./email-layout";
import type { EmailOrderSummary } from "./types";

interface Props {
  customerName: string;
  order: EmailOrderSummary;
  orderUrl: string;
  storeName?: string;
}

function fmtPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function OrderConfirmationEmail({ customerName, order, orderUrl, storeName = "ShopNest" }: Props) {
  const fmt = (n: number) => fmtPrice(n, order.currency_code);
  const paymentLabel = order.payment_provider === "cod" ? "Cash on Delivery" : "Online Payment";

  return (
    <EmailLayout
      previewText={`Order #${order.order_number} confirmed — thank you for shopping at ${storeName}!`}
      storeName={storeName}
    >
      {/* Status badge */}
      <Text style={styles.badge("#16a34a")}>✓ Order Confirmed</Text>

      <Text style={styles.h1}>Thank you, {customerName}!</Text>
      <Text style={styles.p}>
        We've received your order and it's now being processed. You'll receive another email
        once your order has been shipped.
      </Text>

      <Text style={styles.label}>Order Number</Text>
      <Text style={{ ...styles.p, fontWeight: 600 }}>#{order.order_number}</Text>

      <Text style={styles.label}>Payment Method</Text>
      <Text style={{ ...styles.p }}>{paymentLabel}</Text>

      <Hr style={styles.divider} />

      {/* Order items */}
      <Text style={styles.label}>Items Ordered</Text>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Product</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Qty</th>
            <th style={{ ...styles.th, textAlign: "right" }}>Price</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, i) => (
            <tr key={i}>
              <td style={styles.td}>
                <Text style={{ margin: 0, fontWeight: 500 }}>{item.product_name}</Text>
                {item.variant_name && item.variant_name !== "Default" && (
                  <Text style={{ ...styles.muted, margin: "2px 0 0" }}>{item.variant_name}</Text>
                )}
              </td>
              <td style={{ ...styles.td, textAlign: "center" }}>{item.quantity}</td>
              <td style={{ ...styles.td, textAlign: "right" }}>
                {fmt(item.unit_price * item.quantity)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pricing breakdown */}
      <table style={{ ...styles.table, marginTop: 8 }}>
        <tbody>
          <tr>
            <td style={{ ...styles.muted, padding: "4px 0" }}>Subtotal</td>
            <td style={{ ...styles.muted, textAlign: "right", padding: "4px 0" }}>{fmt(order.subtotal)}</td>
          </tr>
          {order.discount > 0 && (
            <tr>
              <td style={{ ...styles.muted, padding: "4px 0", color: "#16a34a" }}>Discount</td>
              <td style={{ ...styles.muted, textAlign: "right", padding: "4px 0", color: "#16a34a" }}>
                −{fmt(order.discount)}
              </td>
            </tr>
          )}
          <tr>
            <td style={{ ...styles.muted, padding: "4px 0" }}>Tax</td>
            <td style={{ ...styles.muted, textAlign: "right", padding: "4px 0" }}>{fmt(order.tax)}</td>
          </tr>
          <tr>
            <td style={{ ...styles.muted, padding: "4px 0" }}>Shipping</td>
            <td style={{ ...styles.muted, textAlign: "right", padding: "4px 0" }}>
              {order.shipping === 0 ? "FREE" : fmt(order.shipping)}
            </td>
          </tr>
          <tr>
            <td style={styles.totalRow}>Total</td>
            <td style={{ ...styles.totalRow, textAlign: "right" }}>{fmt(order.total)}</td>
          </tr>
        </tbody>
      </table>

      <Hr style={styles.divider} />

      {/* Shipping address */}
      <Text style={styles.label}>Shipping To</Text>
      <Text style={{ ...styles.p, marginBottom: 4 }}>{order.shipping_address.full_name}</Text>
      <Text style={styles.muted}>{order.shipping_address.address_line1}</Text>
      {order.shipping_address.address_line2 && (
        <Text style={styles.muted}>{order.shipping_address.address_line2}</Text>
      )}
      <Text style={styles.muted}>
        {order.shipping_address.city}
        {order.shipping_address.state ? `, ${order.shipping_address.state}` : ""}
        {order.shipping_address.postal_code ? ` ${order.shipping_address.postal_code}` : ""}
      </Text>
      <Text style={{ ...styles.muted, marginBottom: 24 }}>{order.shipping_address.country}</Text>

      {/* CTA */}
      <Section style={{ textAlign: "center", marginTop: 8 }}>
        <Link href={orderUrl} style={styles.button}>
          View Order Details
        </Link>
      </Section>
    </EmailLayout>
  );
}
