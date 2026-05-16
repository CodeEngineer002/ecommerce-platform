import { Hr, Link, Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailLayout, styles } from "./email-layout";

interface Props {
  customerName: string;
  orderNumber: string;
  orderUrl: string;
  refundAmount: number;
  currencyCode: string;
  /** "full" | "partial" */
  refundType: string;
  reason?: string | null;
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

export function RefundProcessedEmail({
  customerName,
  orderNumber,
  orderUrl,
  refundAmount,
  currencyCode,
  refundType,
  reason,
  storeName = "ShopNest",
}: Props) {
  const isPartial = refundType === "partial";

  return (
    <EmailLayout
      previewText={`Refund of ${fmtPrice(refundAmount, currencyCode)} for order #${orderNumber} has been processed`}
      storeName={storeName}
    >
      <Text style={styles.badge("#d97706")}>↩ Refund Processed</Text>

      <Text style={styles.h1}>Your refund is on the way</Text>
      <Text style={styles.p}>
        Hi {customerName}, a {isPartial ? "partial " : "full "}refund has been processed for
        your order <strong>#{orderNumber}</strong>.
      </Text>

      <Hr style={styles.divider} />

      <Text style={styles.label}>Refund Amount</Text>
      <Text style={{ ...styles.h1, color: "#d97706", marginBottom: 16 }}>
        {fmtPrice(refundAmount, currencyCode)}
      </Text>

      {reason && (
        <>
          <Text style={styles.label}>Reason</Text>
          <Text style={{ ...styles.p, marginBottom: 16 }}>{reason}</Text>
        </>
      )}

      <Text style={styles.muted}>
        Please allow 5–10 business days for the refund to appear in your account, depending on
        your bank or card provider.
      </Text>

      <Hr style={styles.divider} />

      <Section style={{ textAlign: "center", marginTop: 8 }}>
        <Link href={orderUrl} style={styles.button}>
          View Order Details
        </Link>
      </Section>
    </EmailLayout>
  );
}
