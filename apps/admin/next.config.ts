import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page depends on the signed-in user, so Cache Components is not
  // enabled (docs/architecture.md → "Rendering").
  transpilePackages: ["@itm/api", "@itm/core", "@itm/next", "@itm/types", "@itm/ui"],
  poweredByHeader: false,
  // Own auth cookie, so a website sign-in on the same host (e.g. localhost) never
  // replaces a staff session, and the website never reads a staff session.
  env: { NEXT_PUBLIC_AUTH_COOKIE: "sb-itm-admin-auth" },
  // Catalogue imports are up to 5 MB (admin portal only; the public web app keeps the 1 MB default).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
