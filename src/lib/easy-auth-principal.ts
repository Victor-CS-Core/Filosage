export interface EasyAuthVerifiedIdentity {
  uid: string;
  email: string;
  email_verified: true;
  auth_time?: number;
  name?: string;
  picture?: string;
}

interface EasyAuthClaim {
  typ?: unknown;
  val?: unknown;
}

interface EasyAuthPrincipal {
  auth_typ?: unknown;
  claims?: unknown;
}

function decodedPrincipal(value: string): EasyAuthPrincipal | null {
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as EasyAuthPrincipal;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function claimValue(claims: EasyAuthClaim[], names: string[]) {
  const normalized = new Set(names.map((name) => name.toLowerCase()));
  const claim = claims.find((candidate) =>
    typeof candidate.typ === "string" && normalized.has(candidate.typ.toLowerCase()));
  return typeof claim?.val === "string" ? claim.val : undefined;
}

function integerClaim(claims: EasyAuthClaim[], names: string[]) {
  const value = claimValue(claims, names);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export function easyAuthIdentityFromHeaders(headers: Headers, enabled: boolean): EasyAuthVerifiedIdentity | null {
  if (!enabled) return null;
  const encoded = headers.get("x-ms-client-principal")?.trim();
  if (!encoded) return null;
  const principal = decodedPrincipal(encoded);
  if (!principal) return null;
  const headerProvider = headers.get("x-ms-client-principal-idp")?.trim().toLowerCase();
  const bodyProvider = String(principal.auth_typ ?? "").trim().toLowerCase();
  if ((headerProvider && headerProvider !== "google") || bodyProvider !== "google") return null;

  const claims = Array.isArray(principal.claims) ? principal.claims as EasyAuthClaim[] : [];
  const uid = headers.get("x-ms-client-principal-id")?.trim()
    || claimValue(claims, [
      "sub",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
    ]);
  const email = headers.get("x-ms-client-principal-name")?.trim().toLowerCase()
    || claimValue(claims, [
      "email",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    ])?.trim().toLowerCase();
  if (!uid || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const emailVerified = claimValue(claims, ["email_verified", "urn:google:email_verified"]);
  if (emailVerified?.toLowerCase() === "false") return null;

  return {
    uid,
    email,
    email_verified: true,
    auth_time: integerClaim(claims, ["auth_time", "urn:google:auth_time"]),
    name: claimValue(claims, [
      "name",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
    ]),
    picture: claimValue(claims, ["picture", "urn:google:picture"]),
  };
}
