import type { VerifiedProviderIdentity } from "@/lib/identity-types";

export const REGISTRY_KEY_VERSION = "v1" as const;

export class IdentityLinkRequiredError extends Error {
  readonly code = "identity_link_required";

  constructor() {
    super("This email is already connected to a Filosage learning account. Confirm your existing sign-in to connect the new method.");
  }
}

export class IdentityRegistryConflictError extends Error {
  readonly code = "identity_registry_conflict";

  constructor() {
    super("The identity registry is inconsistent; no account data was changed.");
  }
}

export function normalizedVerifiedEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function requiredExplicitHmacSecret(value: string) {
  const secret = value.trim();
  if (secret.length < 32) {
    throw new Error("IDENTITY_LINK_HMAC_SECRET must contain at least 32 characters.");
  }
  return secret;
}

export async function hmacHex(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredExplicitHmacSecret(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  ));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface IdentityRegistryKeys {
  identityHash: string;
  emailHash: string;
  identityPath: string;
  emailPath: string;
}

export async function identityRegistryKeys(identity: VerifiedProviderIdentity, secret: string) {
  const email = normalizedVerifiedEmail(identity.email);
  if (!email || !identity.emailVerified || !identity.subject || !identity.issuer) {
    throw new IdentityRegistryConflictError();
  }
  const [identityHash, emailHash] = await Promise.all([
    hmacHex(JSON.stringify([
      REGISTRY_KEY_VERSION,
      identity.provider,
      identity.issuer,
      identity.subject,
    ]), secret),
    hmacHex(JSON.stringify([REGISTRY_KEY_VERSION, email]), secret),
  ]);
  return {
    identityHash,
    emailHash,
    identityPath: `identityLinks/${REGISTRY_KEY_VERSION}_${identityHash}`,
    emailPath: `identityEmailOwners/${REGISTRY_KEY_VERSION}_${emailHash}`,
  } satisfies IdentityRegistryKeys;
}
