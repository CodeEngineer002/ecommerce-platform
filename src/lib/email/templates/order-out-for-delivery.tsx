import { Hr, Link, Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailLayout, styles } from "./email-layout";

interface Props {
  customerName:    string;
  orderNumber:     string;
  orderUrl:        string;
  trackingNumber?: string | null;
  trackingUrl?:    string | null;
  carrier?:        string | null;
  storeName?:      string;
}

export function OrderOutForDeliveryEmail({
  customerName,
  orderNumber,
  orderUrl,
  trackingNumber,
  trackingUrl,
  carrier,
  storeName = "ShopNest",
}: Props) {
  return (
    <EmailLayout
      previewText={`Your order #${orderNumber} is out for delivery today!`}
      storeName={storeName}
    >
      <Text style={styles.badge("#7c3aed")}>🚚 Out for Delivery</Text>

      <Text style={styles.h1}>Your package is almost there, {customerName}!</Text>
      <Text style={styles.p}>
        Your order <strong>#{orderNumber}</strong> is out for delivery today. Please make
        sure someone is available to receive it.
      </Text>

      {(trackingNumber || carrier) && (
        <>
          <Hr style={styles.divider} />
          <Text style={styles.label}>Delivery Details</Text>

          {carrier && (
            <>
              <Text style={styles.muted}>Carrier</Text>
              <Text style={{ ...styles.p, fontWeight: 500, marginBottom: 12 }}>{carrier}</Text>
            </>
          )}

          {trackingNumber && (
            <>
              <Text style={styles.muted}>Tracking Number</Text>
              <Text style={{ ...styles.p, fontWeight: 500, marginBottom: 0 }}>
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
