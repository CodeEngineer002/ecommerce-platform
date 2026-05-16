/**
 * Transactional email service — powered by Gmail SMTP via Nodemailer.
 *
 * Safe no-op when GMAIL_USER / GMAIL_APP_PASSWORD are not configured (local dev / CI).
 * All send functions are fire-and-forget: they log errors but never throw,
 * so a transient email failure never rolls back an order or payment.
 *
 * Setup:
 *  1. Google Account → Security → 2-Step Verification ON
 *  2. App Passwords → create one named "ShopNest" → copy 16-char password
 *  3. Set GMAIL_USER=you@gmail.com and GMAIL_APP_PASSWORD=xxxx in .env.local
 */
import "server-only";

import nodemailer from "nodemailer";
import { render } from "@react-email/components";
import type { ReactElement } from "react";

import { serverEnv } from "@/lib/env.server";
import { logger } from "@/lib/logger";

const STORE_NAME = serverEnv.STORE_NAME ?? "ShopNest";
// From address: prefer explicit STORE_FROM_EMAIL, otherwise use the Gmail account itself
const FROM_EMAIL = serverEnv.STORE_FROM_EMAIL ?? serverEnv.GMAIL_USER ?? "";

// ── Singleton transporter ─────────────────────────────────────────────────────
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!serverEnv.GMAIL_USER || !serverEnv.GMAIL_APP_PASSWORD) return null;
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: serverEnv.GMAIL_USER,
      pass: serverEnv.GMAIL_APP_PASSWORD,
    },
  });
  return _transporter;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  react: ReactElement;
}

// ── Core send ─────────────────────────────────────────────────────────────────

/**
 * Send a transactional email via Gmail SMTP. Never throws — errors are logged only.
 * Returns true if the email was accepted, false otherwise.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    logger.warn("[email] GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping email", {
      subject: opts.subject,
      to: opts.to,
    });
    return false;
  }

  try {
    // Render the React Email component to HTML
    const html = await render(opts.react);

    await transporter.sendMail({
      from: `${STORE_NAME} <${FROM_EMAIL}>`,
      to: opts.to,
      subject: opts.subject,
      html,
    });

    logger.info("[email] Sent via Gmail SMTP", { subject: opts.subject, to: opts.to });
    return true;
  } catch (err) {
    logger.error("[email] Gmail SMTP send failure", { err, subject: opts.subject, to: opts.to });
    return false;
  }
}

