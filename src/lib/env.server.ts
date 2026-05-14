/**
 * Server-only environment variables.
 *
 * "server-only" causes a build error if this module is accidentally imported
 * in a Client Component or browser bundle — preventing key leaks.
 */
import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string({ required_error: "SUPABASE_SERVICE_ROLE_KEY is required" })
    .min(1, "SUPABASE_SERVICE_ROLE_KEY cannot be empty"),
  STRIPE_SECRET_KEY: z
    .string()
    .startsWith("sk_", "STRIPE_SECRET_KEY must begin with sk_")
    .optional(),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .startsWith("whsec_", "STRIPE_WEBHOOK_SECRET must begin with whsec_")
    .optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SUPABASE_DB_URL: z.string().optional(),
  // Upstash Redis — required for multi-instance / Vercel rate limiting
  // Leave unset for local dev (falls back to in-memory limiter automatically)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

function validateServerEnv() {
  const result = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    SUPABASE_DB_URL: process.env.SUPABASE_DB_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const message = Object.entries(errors)
      .map(([k, v]) => `  ${k}: ${v?.join(", ")}`)
      .join("\n");
    throw new Error(`\n❌ Invalid server environment variables:\n${message}\n`);
  }

  return result.data;
}

export const serverEnv = validateServerEnv();
export type ServerEnv = z.infer<typeof serverEnvSchema>;
