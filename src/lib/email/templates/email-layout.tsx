/**
 * Shared email layout — wraps all transactional emails with a consistent
 * header, footer, and base styles. Uses @react-email/components primitives
 * so Resend renders to valid HTML for all major email clients.
 */
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

// Brand colours
const PURPLE = "#7c3aed";
const GRAY_BG = "#f9fafb";
const GRAY_BORDER = "#e5e7eb";
const TEXT_MAIN = "#111827";
const TEXT_MUTED = "#6b7280";

interface EmailLayoutProps {
  previewText: string;
  children: React.ReactNode;
  storeName?: string;
}

export function EmailLayout({ previewText, children, storeName = "ShopNest" }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: GRAY_BG, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "32px 16px" }}>
          {/* Header */}
          <Section style={{ textAlign: "center", marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: PURPLE,
                margin: 0,
                letterSpacing: "-0.5px",
              }}
            >
              {storeName}
            </Text>
          </Section>

          {/* Card */}
          <Section
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 8,
              border: `1px solid ${GRAY_BORDER}`,
              padding: "32px 32px 24px",
            }}
          >
            {children}
          </Section>

          {/* Footer */}
          <Section style={{ marginTop: 24, textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: TEXT_MUTED, margin: "0 0 4px" }}>
              You received this email because you placed an order at {storeName}.
            </Text>
            <Text style={{ fontSize: 12, color: TEXT_MUTED, margin: 0 }}>
              © {new Date().getFullYear()} {storeName}. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ── Shared style helpers ──────────────────────────────────────────────────────

export const styles = {
  h1: {
    fontSize: 22,
    fontWeight: 700,
    color: TEXT_MAIN,
    margin: "0 0 8px",
  },
  p: {
    fontSize: 15,
    color: TEXT_MAIN,
    lineHeight: "1.6",
    margin: "0 0 16px",
  },
  muted: {
    fontSize: 13,
    color: TEXT_MUTED,
    margin: "0 0 4px",
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    color: TEXT_MUTED,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    margin: "0 0 4px",
  },
  divider: {
    borderColor: GRAY_BORDER,
    margin: "20px 0",
  },
  badge: (color: string) => ({
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: 9999,
    backgroundColor: color + "1a",
    color: color,
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 16,
  }),
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
  },
  th: {
    fontSize: 11,
    fontWeight: 700,
    color: TEXT_MUTED,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    textAlign: "left" as const,
    padding: "6px 0",
    borderBottom: `1px solid ${GRAY_BORDER}`,
  },
  td: {
    fontSize: 14,
    color: TEXT_MAIN,
    padding: "10px 0",
    borderBottom: `1px solid ${GRAY_BORDER}`,
    verticalAlign: "top" as const,
  },
  totalRow: {
    fontSize: 15,
    fontWeight: 700,
    color: TEXT_MAIN,
    padding: "12px 0 0",
  },
  button: {
    display: "inline-block",
    backgroundColor: PURPLE,
    color: "#ffffff",
    padding: "12px 28px",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    textAlign: "center" as const,
  },
};
