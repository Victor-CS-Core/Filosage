import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const configuredFirebaseAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim().toLowerCase();
const firebaseAuthRelayDomain = configuredFirebaseAuthDomain?.endsWith(".firebaseapp.com")
  ? configuredFirebaseAuthDomain
  : undefined;

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
      // Firebase's same-origin redirect helper contains its own nonce-bearing
      // script and must remain frameable by the Firebase SDK.
      source: "/((?!__).*)",
      // Request-aware HTTPS enforcement is added by proxy.ts. Keeping the
      // static fallback protocol-neutral prevents local production runs from
      // rewriting their own HTTP assets to an unavailable HTTPS origin.
      headers: securityHeaders(process.env.NODE_ENV === "development", undefined, false),
    }];
  },
  async rewrites() {
    if (!firebaseAuthRelayDomain) return [];
    return [{
      source: "/__/auth/:path*",
      destination: `https://${firebaseAuthRelayDomain}/__/auth/:path*`,
    }];
  },
};

export default nextConfig;
