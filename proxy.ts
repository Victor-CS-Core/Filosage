import { NextResponse, type NextRequest } from "next/server";
import { securityHeaders } from "./src/lib/security-headers";

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const responseHeaders = securityHeaders(process.env.NODE_ENV === "development", nonce);
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
