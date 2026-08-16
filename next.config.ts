import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  deploymentId: process.env.SITE_VERSION?.trim() || undefined,
  allowedDevOrigins: ["127.0.0.1"],
  // An owned Playwright dev server gets its own build directory and therefore
  // its own Next dev lock. Normal development and production keep `.next`.
  ...(process.env.FILOSAGE_NEXT_DIST_DIR
    ? { distDir: process.env.FILOSAGE_NEXT_DIST_DIR }
    : {}),
  ...(process.env.FILOSAGE_NEXT_TSCONFIG_PATH
    ? { typescript: { tsconfigPath: process.env.FILOSAGE_NEXT_TSCONFIG_PATH } }
    : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        // Request-aware HTTPS enforcement is added by proxy.ts. Keeping the
        // static fallback protocol-neutral prevents local production runs from
        // rewriting their own HTTP assets to an unavailable HTTPS origin.
        headers: securityHeaders(process.env.NODE_ENV === "development", undefined, false),
      },
      {
        source: "/evidence/shared/:token",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/api/evidence-shares/:token",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
