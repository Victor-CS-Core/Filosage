import { NextResponse } from "next/server";
import { securityHeaders } from "@/lib/security-headers";

export function proxy() {
  const response = NextResponse.next();
  for (const { key, value } of securityHeaders(process.env.NODE_ENV === "development")) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|og.png).*)"],
};
