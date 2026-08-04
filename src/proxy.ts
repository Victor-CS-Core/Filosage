import { NextResponse, type NextRequest } from "next/server";
import { securityHeaders } from "@/lib/security-headers";
import { serverEnvironment } from "@/lib/runtime-environment";

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const isSecureRequest = forwardedProtocol
    ? forwardedProtocol === "https"
    : request.nextUrl.protocol === "https:";
  const responseHeaders = securityHeaders(
    serverEnvironment.NODE_ENV === "development",
    nonce,
    isSecureRequest,
  );
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
      source: "/((?!api|assets|_next/static|_next/image|favicon.ico|theme-bootstrap.js|og.png|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
