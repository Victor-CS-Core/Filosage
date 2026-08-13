import { NextResponse, type NextRequest } from "next/server";
import { isQaEnvironment } from "@/lib/deployment-environment";
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
  if (isQaEnvironment(serverEnvironment)) {
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
