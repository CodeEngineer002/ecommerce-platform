import { Hr, Link, Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailLayout, styles } from "./email-layout";

interface Props {
  customerName: string;
  itemCount:    number;
  cartUrl:      string;
  storeName?:   string;
}

/**
 * Sent ~24h after a cart goes idle. Customer's cart isn't deleted yet — the
 * link lets them resume where they left off.
 */
export function CartAbandonedEmail({
  customerName,
  itemCount,
  cartUrl,
  storeName = "ShopNest",
}: Props) {
  return (
    <EmailLayout
      previewText={`You left ${itemCount} item${itemCount === 1 ? "" : "s"} in your cart`}
      storeName={storeName}
    >
      <Text style={styles.badge("#0ea5e9")}>🛒 Cart Waiting</Text>

      <Text style={styles.h1}>Forgot something?</Text>
      <Text style={styles.p}>
        Hi {customerName}, you left <strong>{itemCount} item{itemCount === 1 ? "" : "s"}</strong>
        {" "}in your cart. We&rsquo;ve saved them for you — come back any time to finish placing
        your order.
      </Text>

      <Hr style={styles.divider} />
      <Text style={{ ...styles.p, marginBottom: 24 }}>
        Heads-up: your cart stays available for ~30 days. After that, items may sell out and your
        cart will be cleared.
      </Text>

      <Section style={{ textAlign: "center" }}>
        <Link href={cartUrl} style={styles.button}>
          Resume Your Cart
        </Link>
      </Section>
    </EmailLayout>
  );
}
