import { Hr, Link, Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailLayout, styles } from "./email-layout";

interface Props {
  customerName: string;
  orderNumber:  string;
  orderUrl:     string;
  amount:       number;
  currencyCode?: string;
  collectedAt?: string | null;
  storeName?:   string;
}

function fmtPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Sent immediately after admin confirms physical cash collection for a COD order.
 * Doubles as the customer's payment receipt for COD — no PDF/invoice needed.
 */
export function CodCollectedEmail({
  customerName,
  orderNumber,
  orderUrl,
  amount,
  currencyCode = "INR",
  collectedAt,
  storeName = "ShopNest",
}: Props) {
  const dateLine =
    collectedAt
      ? new Date(collectedAt).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;

  return (
    <EmailLayout
      previewText={`Cash received for order #${orderNumber}`}
      storeName={storeName}
    >
      <Text style={styles.badge("#16a34a")}>✓ Payment Received</Text>

      <Text style={styles.h1}>Cash received — thank you!</Text>
      <Text style={styles.p}>
        Hi {customerName}, we&rsquo;ve received <strong>{fmtPrice(amount, currencyCode)}</strong>
        {" "}in cash for your order <strong>#{orderNumber}</strong>. This email serves as your
        payment receipt — please keep it for your records.
      </Text>

      <Hr style={styles.divider} />
      <Text style={styles.label}>Receipt details</Text>
      <Text style={styles.p}>
        <strong>Order:</strong> #{orderNumber}<br />
        <strong>Amount paid:</strong> {fmtPrice(amount, currencyCode)}<br />
        <strong>Payment method:</strong> Cash on Delivery
        {dateLine && (
          <><br /><strong>Received on:</strong> {dateLine}</>
        )}
      </Text>

      <Hr style={styles.divider} />
      <Text style={{ ...styles.p, marginBottom: 24 }}>
        If you didn&rsquo;t hand over cash, or the amount above looks wrong, please reply to this
        email within 24 hours.
      </Text>

      <Section style={{ textAlign: "center" }}>
        <Link href={orderUrl} style={styles.button}>
          View Order Details
        </Link>
      </Section>
    </EmailLayout>
  );
}
