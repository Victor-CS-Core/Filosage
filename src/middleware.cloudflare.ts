import { NextResponse, type NextRequest } from "next/server";
import { securityHeaders } from "@/lib/security-headers";

/**
 * Edge middleware for Cloudflare Workers builds.
 *
 * Next 16 runs `proxy.ts` on the Node.js runtime unconditionally, which
 * @opennextjs/cloudflare cannot bundle. The deprecated `middleware.ts`
 * convention still defaults to the Edge runtime, so Cloudflare builds swap
 * this file in as `src/middleware.ts` (see scripts/build-cloudflare.mjs).
 * Standard local Next.js builds keep using `src/proxy.ts` unchanged.
 *
 * Behavior mirrors proxy.ts exactly: full security-header set, CSP nonce,
 * www -> apex redirect, QA robots tag. Environment reads use static
 * `process.env.X` accesses so Next inlines them at build time; set
 * DEPLOYMENT_ENVIRONMENT when building (e.g. "staging") to control the
 * robots tag.
 */

function isQaBuild(): boolean {
  const operationsEnv = (process.env.OPERATIONS_ENVIRONMENT ?? "").trim().toLowerCase();
  const deploymentEnv = (process.env.DEPLOYMENT_ENVIRONMENT ?? "").trim().toLowerCase();
  return operationsEnv === "qa" || deploymentEnv === "qa";
}

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const isSecureRequest = forwardedProtocol
    ? forwardedProtocol === "https"
    : request.nextUrl.protocol === "https:";
  const responseHeaders = securityHeaders(
    process.env.NODE_ENV === "development",
    nonce,
    isSecureRequest,
  );
  if (request.nextUrl.pathname.startsWith("/evidence/shared/")) {
    const referrerPolicy = responseHeaders.find((header) => header.key === "Referrer-Policy");
    if (referrerPolicy) referrerPolicy.value = "no-referrer";
  }
  if (isQaBuild()) {
    responseHeaders.push({ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" });
  }
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = (forwardedHost || request.headers.get("host") || "").split(":")[0]?.toLowerCase();
  if (host === "www.filosage.com") {
    const destination = request.nextUrl.clone();
    destination.protocol = "https:";
    destination.hostname = "filosage.com";
    destination.port = "";
    const redirect = NextResponse.redirect(destination, 308);
    for (const { key, value } of responseHeaders) redirect.headers.set(key, value);
    return redirect;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  for (const { key, value } of responseHeaders) requestHeaders.set(key, value);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const { key, value } of responseHeaders) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|assets|__|_next/static|_next/image|favicon.ico|theme-bootstrap.js|og.png|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
