const FIRST_PARTY_FIREBASE_AUTH_HOSTS = new Set([
  "filosage.com",
  "www.filosage.com",
]);

export function resolveFirebaseAuthDomain(
  configuredDomain: string | undefined,
  currentHostname: string | undefined,
) {
  const hostname = currentHostname?.trim().toLowerCase();
  if (hostname && FIRST_PARTY_FIREBASE_AUTH_HOSTS.has(hostname)) return hostname;
  return configuredDomain;
}
