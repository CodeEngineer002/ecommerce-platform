import type { NextConfig } from "next";

// ── Security Headers ──────────────────────────────────────────────────────────
// Static headers applied to all routes via next.config.ts.
//
// NOTE: Content-Security-Policy is intentionally NOT here.
// CSP is set dynamically per-request in src/middleware.ts with a unique nonce,
// which removes the need for 'unsafe-inline' on script-src.
const securityHeaders = [
  {
    // Prevent clickjacking
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    // Block MIME sniffing
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Referrer policy: send origin only on cross-origin requests
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Permissions policy: disable unused browser features
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(self)",
  },
  {
    // HSTS: force HTTPS for 1 year (enable only after confirming HTTPS deployment)
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // @supabase/ssr bundles both browser and server code in the same index.
  // Next.js RSC's |ssr webpack layer cannot assign IDs to those server-only
  // sub-modules when they appear in the client-component pre-render graph.
  // Marking the package as a server external (loaded via Node require at
  // runtime) prevents the webpack bundling conflict while keeping
  // createBrowserClient available for actual browser bundles.
  serverExternalPackages: ["@supabase/ssr"],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },

  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],
  },

  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
