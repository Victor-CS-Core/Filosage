const FIREBASE_AUTH_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-type",
  "user-agent",
]);

const FIREBASE_AUTH_RESPONSE_HEADERS = new Set([
  "cache-control",
  "content-type",
  "expires",
  "location",
  "pragma",
  "set-cookie",
]);

export function firebaseAuthRelayOrigin(configuredDomain: string | undefined) {
  const domain = configuredDomain?.trim().toLowerCase();
  if (!domain?.endsWith(".firebaseapp.com")) return null;
  return `https://${domain}`;
}

export function firebaseAuthRelayRequestHeaders(source: Headers) {
  const headers = new Headers();
  for (const [key, value] of source) {
    if (FIREBASE_AUTH_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  }
  return headers;
}

export function firebaseAuthRelayResponseHeaders(source: Headers) {
  const headers = new Headers();
  for (const [key, value] of source) {
    if (FIREBASE_AUTH_RESPONSE_HEADERS.has(key.toLowerCase())) headers.append(key, value);
  }
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}
