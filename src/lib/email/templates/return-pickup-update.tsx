import { Hr, Link, Section, Text } from "@react-email/components";
import * as React from "react";

import { EmailLayout, styles } from "./email-layout";

export type PickupStage = "scheduled" | "collected" | "received";

interface Props {
  customerName: string;
  orderNumber: string;
  orderUrl: string;
  stage: PickupStage;
  requestType: "return" | "replacement";
  storeName?: string;
}

const STAGE_CONFIG: Record<
  PickupStage,
  { badge: string; badgeColor: string; title: string; body: string }
> = {
  scheduled: {
    badge:       "🚚 Pickup Scheduled",
    badgeColor:  "#7c3aed",
    title:       "Pickup is on the way!",
    body:        "Our delivery partner has been scheduled to collect your item. Please keep it ready — they will be there soon.",
  },
  collected: {
    badge:       "📦 Item Collected",
    badgeColor:  "#2563eb",
    title:       "Your item has been collected",
    body:        "Our delivery partner has picked up your item and it is now on its way to our warehouse. We will update you once it arrives.",
  },
  received: {
    badge:       "🏭 Item Received",
    badgeColor:  "#059669",
    title:       "We have received your item",
    body:        "Your item has arrived at our warehouse. Our team will inspect it and you will hear from us within 3–5 business days with an update on your refund or replacement.",
  },
};

export function ReturnPickupUpdateEmail({
  customerName,
  orderNumber,
  orderUrl,
  stage,
  requestType,
  storeName = "ShopNest",
}: Props) {
  const config = STAGE_CONFIG[stage];

  return (
    <EmailLayout
      previewText={`Update on your ${requestType} for order #${orderNumber}: ${config.badge}`}
      storeName={storeName}
    >
      <Text style={styles.badge(config.badgeColor)}>{config.badge}</Text>

      <Text style={styles.h1}>{config.title}</Text>

      <Text style={styles.p}>Hi {customerName},</Text>

      <Text style={styles.p}>{config.body}</Text>

      <Hr style={styles.divider} />

      <Section style={{ textAlign: "center", marginTop: 8 }}>
        <Link href={orderUrl} style={styles.button}>
          View Order Details
        </Link>
      </Section>
    </EmailLayout>
  );
}
