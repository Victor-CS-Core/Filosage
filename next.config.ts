import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // An owned Playwright dev server gets its own build directory and therefore
  // its own Next dev lock. Normal development and production keep `.next`.
  ...(process.env.FILOSAGE_NEXT_DIST_DIR
    ? { distDir: process.env.FILOSAGE_NEXT_DIST_DIR }
    : {}),
  ...(process.env.FILOSAGE_NEXT_TSCONFIG_PATH
    ? { typescript: { tsconfigPath: process.env.FILOSAGE_NEXT_TSCONFIG_PATH } }
    : {}),
  async headers() {
    return [{
      source: "/:path*",
      // Request-aware HTTPS enforcement is added by proxy.ts. Keeping the
      // static fallback protocol-neutral prevents local production runs from
      // rewriting their own HTTP assets to an unavailable HTTPS origin.
      headers: securityHeaders(process.env.NODE_ENV === "development", undefined, false),
    }];
  },
};

export default nextConfig;
