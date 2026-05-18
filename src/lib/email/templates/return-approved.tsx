import { Hr, Link, Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailLayout, styles } from "./email-layout";

interface Props {
  customerName: string;
  orderNumber: string;
  orderUrl: string;
  requestType: "return" | "replacement";
  reviewNote?: string | null;
  storeName?: string;
}

export function ReturnApprovedEmail({
  customerName,
  orderNumber,
  orderUrl,
  requestType,
  reviewNote,
  storeName = "ShopNest",
}: Props) {
  const isReplacement = requestType === "replacement";

  return (
    <EmailLayout
      previewText={`Your ${requestType} request for order #${orderNumber} has been approved`}
      storeName={storeName}
    >
      <Text style={styles.badge(isReplacement ? "#2563eb" : "#059669")}>
        {isReplacement ? "🔄 Replacement Approved" : "✅ Return Approved"}
      </Text>

      <Text style={styles.h1}>
        Great news, {customerName}!
      </Text>
      <Text style={styles.p}>
        Your <strong>{requestType} request</strong> for order{" "}
        <strong>#{orderNumber}</strong> has been approved.
      </Text>

      {isReplacement ? (
        <Text style={styles.p}>
          We&apos;re arranging pickup of your original item. Once it is collected, your
          replacement order will be shipped to you. You&apos;ll receive a tracking update
          when it&apos;s on the way.
        </Text>
      ) : (
        <Text style={styles.p}>
          Our delivery partner will contact you shortly to schedule a pickup of the item.
          Please keep the item ready in its original condition. Once we receive and inspect
          it, your refund will be initiated.
        </Text>
      )}

      {reviewNote && (
        <>
          <Hr style={styles.divider} />
          <Text style={styles.label}>Note from our team</Text>
          <Text style={{ ...styles.p, fontStyle: "italic" }}>{reviewNote}</Text>
        </>
      )}

      <Hr style={styles.divider} />

      <Section style={{ textAlign: "center", marginTop: 8 }}>
        <Link href={orderUrl} style={styles.button}>
          Track My Order
        </Link>
      </Section>
    </EmailLayout>
  );
}
