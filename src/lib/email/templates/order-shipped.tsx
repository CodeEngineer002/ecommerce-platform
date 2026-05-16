import { Hr, Link, Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailLayout, styles } from "./email-layout";

interface Props {
  customerName: string;
  orderNumber: string;
  orderUrl: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  carrier?: string | null;
  estimatedDelivery?: string | null;
  storeName?: string;
}

export function OrderShippedEmail({
  customerName,
  orderNumber,
  orderUrl,
  trackingNumber,
  trackingUrl,
  carrier,
  estimatedDelivery,
  storeName = "ShopNest",
}: Props) {
  return (
    <EmailLayout
      previewText={`Your order #${orderNumber} has been shipped!`}
      storeName={storeName}
    >
      <Text style={styles.badge("#2563eb")}>📦 Order Shipped</Text>

      <Text style={styles.h1}>Your order is on the way, {customerName}!</Text>
      <Text style={styles.p}>
        Great news — your order <strong>#{orderNumber}</strong> has been shipped and is heading
        your way.
      </Text>

      {(trackingNumber || carrier) && (
        <>
          <Hr style={styles.divider} />
          <Text style={styles.label}>Shipping Details</Text>

          {carrier && (
            <>
              <Text style={styles.muted}>Carrier</Text>
              <Text style={{ ...styles.p, fontWeight: 500, marginBottom: 12 }}>{carrier}</Text>
            </>
          )}

          {trackingNumber && (
            <>
              <Text style={styles.muted}>Tracking Number</Text>
              <Text style={{ ...styles.p, fontWeight: 500, marginBottom: 12 }}>
                {trackingUrl ? (
                  <Link href={trackingUrl} style={{ color: "#7c3aed" }}>
                    {trackingNumber}
                  </Link>
                ) : (
                  trackingNumber
                )}
              </Text>
            </>
          )}

          {estimatedDelivery && (
            <>
              <Text style={styles.muted}>Estimated Delivery</Text>
              <Text style={{ ...styles.p, fontWeight: 500, marginBottom: 0 }}>
                {estimatedDelivery}
              </Text>
            </>
          )}
        </>
      )}

      <Hr style={styles.divider} />

      <Section style={{ textAlign: "center", marginTop: 8 }}>
        {trackingUrl ? (
          <Link href={trackingUrl} style={styles.button}>
            Track Your Package
          </Link>
        ) : (
          <Link href={orderUrl} style={styles.button}>
            View Order Details
          </Link>
        )}
      </Section>
    </EmailLayout>
  );
}
