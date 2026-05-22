import { Hr, Link, Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailLayout, styles } from "./email-layout";

interface Props {
  customerName: string;
  orderNumber:  string;
  orderUrl:     string;
  deliveredAt?: string | null;
  storeName?:   string;
}

export function OrderDeliveredEmail({
  customerName,
  orderNumber,
  orderUrl,
  deliveredAt,
  storeName = "ShopNest",
}: Props) {
  const deliveredDate = deliveredAt
    ? new Date(deliveredAt).toLocaleDateString("en-IN", {
        weekday: "long",
        year:    "numeric",
        month:   "long",
        day:     "numeric",
      })
    : null;

  return (
    <EmailLayout
      previewText={`Your order #${orderNumber} has been delivered!`}
      storeName={storeName}
    >
      <Text style={styles.badge("#16a34a")}>✓ Order Delivered</Text>

      <Text style={styles.h1}>Your order has arrived, {customerName}!</Text>
      <Text style={styles.p}>
        Great news — your order <strong>#{orderNumber}</strong> has been successfully delivered.
        We hope you love your purchase!
      </Text>

      {deliveredDate && (
        <>
          <Text style={styles.label}>Delivered On</Text>
          <Text style={{ ...styles.p, fontWeight: 500, marginBottom: 16 }}>
            {deliveredDate}
          </Text>
        </>
      )}

      <Hr style={styles.divider} />

      <Text style={styles.p}>
        If you have any issues with your order — damaged item, wrong product, or anything
        else — please visit the order details page to request a return or replacement within
        the eligible window.
      </Text>

      <Section style={{ textAlign: "center", marginTop: 8 }}>
        <Link href={orderUrl} style={styles.button}>
          View Order &amp; Leave a Review
        </Link>
      </Section>

      <Hr style={styles.divider} />

      <Text style={{ ...styles.muted, textAlign: "center" }}>
        Thank you for shopping with {storeName}. We look forward to serving you again!
      </Text>
    </EmailLayout>
  );
}
