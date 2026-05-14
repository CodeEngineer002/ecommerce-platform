import type { NextConfig } from "next";

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
};

export default nextConfig;
