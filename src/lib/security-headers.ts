export const STRICT_TRANSPORT_SECURITY = "max-age=63072000; includeSubDomains; preload";

export function withStrictTransportSecurity(request: Request, response: Response) {
  if (new URL(request.url).protocol !== "https:") return response;
  const headers = new Headers(response.headers);
  headers.set("Strict-Transport-Security", STRICT_TRANSPORT_SECURITY);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function securityHeaders(
  isDevelopment = false,
  nonce?: string,
  isSecureRequest = true,
) {
  const developmentScriptAllowance = isDevelopment ? " 'unsafe-eval'" : "";
  const developmentConnectAllowance = isDevelopment ? " ws: http:" : "";
  const nonceAllowance = nonce ? ` 'nonce-${nonce}' 'strict-dynamic'` : "";
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self'${nonceAllowance}${developmentScriptAllowance}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    `connect-src 'self'${developmentConnectAllowance} https://*.ciamlogin.com https://login.microsoftonline.com https://graph.microsoft.com`,
    "frame-src 'self' https://*.ciamlogin.com https://login.microsoftonline.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'none'",
    !isDevelopment && isSecureRequest ? "upgrade-insecure-requests" : "",
  ].filter(Boolean).join("; ");

  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-XSS-Protection", value: "0" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "Cross-Origin-Resource-Policy", value: "same-site" },
    { key: "Origin-Agent-Cluster", value: "?1" },
    isSecureRequest
      ? { key: "Strict-Transport-Security", value: STRICT_TRANSPORT_SECURITY }
      : null,
  ].filter((header): header is { key: string; value: string } => header !== null);
}
