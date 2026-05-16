/**
 * Content-Security-Policy helpers.
 *
 * CSP is set dynamically per-request in middleware (not statically in next.config.ts)
 * so that each response can include a unique per-request nonce for inline scripts.
 *
 * Dev vs Prod behaviour:
 *   - Development: relaxed CSP — webpack HMR needs `unsafe-eval`, fast-refresh
 *     needs `unsafe-inline`. Security enforcement happens in production only.
 *   - Production: strict nonce-based CSP — `unsafe-inline` removed from script-src,
 *     replaced with per-request nonce + `strict-dynamic`.
 *
 * Style nonces:
 *   Tailwind CSS and Radix UI emit inline styles that cannot be individually nonced
 *   without a full CSS-in-JS migration. `unsafe-inline` stays on style-src in both envs.
 */

/**
 * Generates a cryptographically random, URL-safe base64 nonce (128-bit entropy).
 * Safe to call in both Edge Runtime and Node.js.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Returns the full Content-Security-Policy header value.
 *
 * In development: permissive — allows `unsafe-eval` (webpack HMR) and
 * `unsafe-inline` (fast-refresh inline scripts). The nonce is still generated
 * and forwarded via `x-nonce` so the layout works consistently in both envs.
 *
 * In production: nonce-based — `unsafe-eval` and `unsafe-inline` removed from
 * script-src. Only scripts with the matching `nonce` attribute execute.
 * `strict-dynamic` lets Stripe/Razorpay loaders run without listing every CDN.
 */
export function buildCspWithNonce(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";

  const scriptSrc = isDev
    ? // Dev: webpack needs eval() for source maps; fast-refresh emits inline scripts
      `script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://checkout.razorpay.com`
    : // Prod: strict nonce — no unsafe-eval, no unsafe-inline
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://checkout.razorpay.com`;

  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://api.stripe.com https://checkout.razorpay.com https://*.sentry.io https://o4511399426916352.ingest.de.sentry.io",
    "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.razorpay.com",
    // Sentry Session Replay uses a Web Worker loaded via blob: URL
    "worker-src blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  return directives.join("; ");
}

