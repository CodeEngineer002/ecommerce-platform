/**
 * Quick email test — run with:
 *   npx tsx scripts/test-email.ts your@email.com
 *
 * Directly uses nodemailer + .env.local — no Next.js runtime needed.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

// Load .env.local explicitly (dotenv default only loads .env)
config({ path: resolve(process.cwd(), ".env.local") });
import nodemailer from "nodemailer";
import { render } from "@react-email/components";
import * as React from "react";

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const STORE_NAME = process.env.STORE_NAME ?? "ShopNest";

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: npx tsx scripts/test-email.ts recipient@email.com");
    process.exit(1);
  }
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error("GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env.local");
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  // Inline test template
  const { OrderConfirmationEmail } = await import("../src/lib/email/templates/order-confirmation.js");

  const html = await render(
    React.createElement(OrderConfirmationEmail, {
      customerName: "Test User",
      storeName: STORE_NAME,
      orderUrl: "http://localhost:3000/orders/test-order-123",
      order: {
        order_number: "ORD-2026-001",
        created_at: new Date().toISOString(),
        items: [
          { product_name: "Premium Wireless Headphones", variant_name: "Black", quantity: 1, unit_price: 2999 },
          { product_name: "USB-C Cable", variant_name: null, quantity: 2, unit_price: 199 },
        ],
        subtotal: 3397,
        discount: 200,
        tax: 305,
        shipping: 0,
        total: 3502,
        currency_code: "INR",
        payment_provider: "cod",
        shipping_address: {
          full_name: "Test User",
          address_line1: "123 MG Road",
          address_line2: "Apt 4B",
          city: "Mumbai",
          state: "Maharashtra",
          postal_code: "400001",
          country: "India",
        },
      },
    }),
  );

  console.log(`Sending test email to: ${to} ...`);
  await transporter.sendMail({
    from: `${STORE_NAME} <${GMAIL_USER}>`,
    to,
    subject: `[TEST] Order #ORD-2026-001 confirmed — ${STORE_NAME}`,
    html,
  });
  console.log("✓ Email sent! Check your inbox (and spam folder).");
}

main().catch((err) => {
  console.error("Email test failed:", err.message ?? err);
  process.exit(1);
});
