import { Hr, Link, Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailLayout, styles } from "./email-layout";

interface Props {
  customerName: string;
  orderNumber: string;
  orderUrl: string;
  reason?: string | null;
  /** If a refund has been initiated include the amount */
  refundAmount?: number | null;
  currencyCode?: string;
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

export function OrderCancelledEmail({
  customerName,
  orderNumber,
  orderUrl,
  reason,
  refundAmount,
  currencyCode = "USD",
  storeName = "ShopNest",
}: Props) {
  return (
    <EmailLayout
      previewText={`Your order #${orderNumber} has been cancelled`}
      storeName={storeName}
    >
      <Text style={styles.badge("#dc2626")}>✕ Order Cancelled</Text>

      <Text style={styles.h1}>Your order has been cancelled</Text>
      <Text style={styles.p}>
        Hi {customerName}, your order <strong>#{orderNumber}</strong> has been cancelled.
        {reason ? ` Reason: ${reason}.` : ""}
      </Text>

      {refundAmount != null && refundAmount > 0 && (
        <>
          <Hr style={styles.divider} />
          <Text style={styles.label}>Refund</Text>
          <Text style={styles.p}>
            A refund of <strong>{fmtPrice(refundAmount, currencyCode)}</strong> will be processed
            back to your original payment method within 5–10 business days.
          </Text>
        </>
      )}

      <Hr style={styles.divider} />
      <Text style={{ ...styles.p, marginBottom: 24 }}>
        If you have any questions about your cancellation, please contact our support team and
        reference your order number.
      </Text>

      <Section style={{ textAlign: "center" }}>
        <Link href={orderUrl} style={styles.button}>
          View Order Details
        </Link>
      </Section>
    </EmailLayout>
  );
}
