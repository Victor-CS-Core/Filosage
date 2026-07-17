export function securityHeaders(isDevelopment = false) {
  const developmentScriptAllowance = isDevelopment ? " 'unsafe-eval'" : "";
  const developmentConnectAllowance = isDevelopment ? " ws: http:" : "";
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline'${developmentScriptAllowance} https://apis.google.com https://accounts.google.com`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    `connect-src 'self'${developmentConnectAllowance} https://*.googleapis.com https://*.firebaseio.com https://accounts.google.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com`,
    "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  ];
}
