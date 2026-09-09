import type { AuthenticationRuntimeConfiguration } from "@/lib/auth-runtime";
import { providerDisplayName } from "@/lib/display-name";
import type { VerifiedProviderIdentity } from "@/lib/identity-types";

interface EasyAuthClaim {
  typ?: unknown;
  val?: unknown;
}

interface EasyAuthPrincipal {
  auth_typ?: unknown;
  claims?: unknown;
}

function isEasyAuthClaim(value: unknown): value is EasyAuthClaim {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function normalizedEmail(value: string | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function easyAuthIdentityFromHeaders(
  headers: Headers,
  config: AuthenticationRuntimeConfiguration,
): VerifiedProviderIdentity | null {
  if (!config.easyAuthEnabled) return null;
  const encoded = headers.get("x-ms-client-principal")?.trim();
  if (!encoded) return null;
  const principal = decodedPrincipal(encoded);
  if (!principal) return null;
  if (principal.claims !== undefined && (
    !Array.isArray(principal.claims) || !principal.claims.every(isEasyAuthClaim)
  )) return null;
  const claims = principal.claims ?? [];
  const headerProvider = headers.get("x-ms-client-principal-idp")?.trim().toLowerCase();
  const bodyProvider = String(principal.auth_typ ?? "").trim().toLowerCase();
  if (!headerProvider || !bodyProvider || headerProvider !== bodyProvider) return null;

  const provider = headerProvider === "google" && config.directGoogleEnabled
    ? "google"
    : headerProvider === "filosage" && config.externalIdEnabled
      ? "filosage"
      : null;
  if (!provider) return null;

  const assertedIssuer = claimValue(claims, ["iss"])?.trim().replace(/\/$/, "");
  const expectedIssuer = provider === "google" ? config.directGoogleIssuer : config.externalIdIssuer;
  if (!expectedIssuer || (assertedIssuer && assertedIssuer !== expectedIssuer)) return null;
  if (provider === "filosage" && assertedIssuer !== expectedIssuer) return null;

  const subject = claimValue(claims, [
    "sub",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
  ])?.trim() || (provider === "google" ? headers.get("x-ms-client-principal-id")?.trim() : "");
  const email = normalizedEmail(
    headers.get("x-ms-client-principal-name")
      ?? claimValue(claims, ["email", "emails", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"]),
  );
  if (!subject || !email) return null;
  if (provider === "google") {
    const verificationClaims = claims.filter((claim) =>
      typeof claim.typ === "string" &&
      ["email_verified", "urn:google:email_verified"].includes(claim.typ.toLowerCase()));
    if (verificationClaims.length !== 1) return null;
    const verified = verificationClaims[0].val;
    if (typeof verified !== "string" || verified.trim().toLowerCase() !== "true") return null;
  }

  return {
    provider,
    issuer: expectedIssuer,
    subject,
    email,
    emailVerified: true,
    authTime: integerClaim(claims, ["auth_time", "urn:google:auth_time"]),
    name: providerDisplayName(
      claimValue(claims, ["name", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"]),
      email,
    ) ?? undefined,
    picture: claimValue(claims, ["picture", "urn:google:picture"]),
  };
}
