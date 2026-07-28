import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
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
