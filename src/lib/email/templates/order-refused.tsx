import { Hr, Link, Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailLayout, styles } from "./email-layout";

interface Props {
  customerName: string;
  orderNumber: string;
  orderUrl: string;
  /** Reason the courier captured for refusal — informational only. */
  reason?: string | null;
  storeName?: string;
}

export function OrderRefusedEmail({
  customerName,
  orderNumber,
  orderUrl,
  reason,
  storeName = "ShopNest",
}: Props) {
  return (
    <EmailLayout
      previewText={`Update on order #${orderNumber} — delivery refused`}
      storeName={storeName}
    >
      <Text style={styles.badge("#f59e0b")}>↩ Delivery Refused</Text>

      <Text style={styles.h1}>Your package is being returned to us</Text>
      <Text style={styles.p}>
        Hi {customerName}, our courier marked your order
        {" "}<strong>#{orderNumber}</strong> as refused at delivery.
        {reason ? ` Reason recorded: ${reason}.` : ""}
      </Text>

      <Hr style={styles.divider} />
      <Text style={styles.label}>What happens next</Text>
      <Text style={styles.p}>
        The package will be returned to our warehouse over the next few days. Once received, your
        order will be automatically cancelled and any pending COD amount will be cleared — no
        further action is required from you.
      </Text>

      <Hr style={styles.divider} />
      <Text style={styles.label}>Was this a mistake?</Text>
      <Text style={styles.p}>
        If you believe the refusal was recorded in error or you still want the product, please
        reply to this email with your order number within 24 hours so we can intercept the return.
      </Text>

      <Section style={{ textAlign: "center", marginTop: 24 }}>
        <Link href={orderUrl} style={styles.button}>
          View Order Details
        </Link>
      </Section>
    </EmailLayout>
  );
}
