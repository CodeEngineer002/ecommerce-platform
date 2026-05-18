import { Hr, Link, Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailLayout, styles } from "./email-layout";

interface Props {
  customerName: string;
  orderNumber: string;
  orderUrl: string;
  requestType: "return" | "replacement";
  reason?: string | null;
  storeName?: string;
}

export function ReturnRejectedEmail({
  customerName,
  orderNumber,
  orderUrl,
  requestType,
  reason,
  storeName = "ShopNest",
}: Props) {
  return (
    <EmailLayout
      previewText={`Update on your ${requestType} request for order #${orderNumber}`}
      storeName={storeName}
    >
      <Text style={styles.badge("#dc2626")}>❌ Request Not Approved</Text>

      <Text style={styles.h1}>Hi {customerName},</Text>
      <Text style={styles.p}>
        Unfortunately, we were unable to approve your <strong>{requestType} request</strong>{" "}
        for order <strong>#{orderNumber}</strong>.
      </Text>

      {reason && (
        <>
          <Hr style={styles.divider} />
          <Text style={styles.label}>Reason</Text>
          <Text style={{ ...styles.p, fontStyle: "italic" }}>{reason}</Text>
        </>
      )}

      <Text style={styles.p}>
        If you believe this was an error or have questions, please contact our support team
        and reference your order number.
      </Text>

      <Hr style={styles.divider} />

      <Section style={{ textAlign: "center", marginTop: 8 }}>
        <Link href={orderUrl} style={styles.button}>
          View Order
        </Link>
      </Section>
    </EmailLayout>
  );
}
