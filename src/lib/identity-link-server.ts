import "server-only";

import { getStoredDocument } from "@/lib/firebase-server";
import {
  IdentityRegistryConflictError,
  REGISTRY_KEY_VERSION,
  identityRegistryKeys as identityRegistryKeysWithSecret,
} from "@/lib/identity-link-policy";
import type { VerifiedProviderIdentity, VerifiedUser } from "@/lib/identity-types";
import { isLocalMode } from "@/lib/local-mode";
import { serverEnvironment } from "@/lib/runtime-environment";

export {
  IdentityLinkRequiredError,
  IdentityRegistryConflictError,
} from "@/lib/identity-link-policy";

function requiredHmacSecret(explicit?: string) {
  const secret = explicit?.trim()
    || serverEnvironment.IDENTITY_LINK_HMAC_SECRET?.trim()
    || (isLocalMode() ? "filosage-local-identity-link-secret-v1" : "");
  if (secret.length < 32) {
    throw new Error("IDENTITY_LINK_HMAC_SECRET must contain at least 32 characters.");
  }
  return secret;
}

export function configuredIdentityRegistryKeys(
  identity: VerifiedProviderIdentity,
  explicit?: string,
) {
  return identityRegistryKeysWithSecret(identity, requiredHmacSecret(explicit));
}

function canonicalUser(
  identity: VerifiedProviderIdentity,
  uid: string,
  identityLinkRegistered: boolean,
): VerifiedUser {
  return {
    uid,
    email: identity.email,
    email_verified: true,
    auth_time: identity.authTime,
    name: identity.name,
    picture: identity.picture,
    providerIdentity: identity,
    identityLinkRegistered,
  };
}

export async function resolveCanonicalIdentity(identity: VerifiedProviderIdentity) {
  if (identity.provider === "local") return canonicalUser(identity, identity.subject, true);
  const keys = await configuredIdentityRegistryKeys(identity);
  const link = await getStoredDocument(keys.identityPath);
  const canonicalUid = typeof link?.canonicalUid === "string" ? link.canonicalUid.trim() : "";
  if (!canonicalUid) return canonicalUser(identity, identity.subject, false);
  if (link?.keyVersion !== REGISTRY_KEY_VERSION || link?.identityHash !== keys.identityHash) {
    throw new IdentityRegistryConflictError();
  }
  return canonicalUser(identity, canonicalUid, true);
}

export type IdentityOnboardingState = "ready" | "new_account" | "identity_link_required";

export async function identityOnboardingState(user: VerifiedUser): Promise<IdentityOnboardingState> {
  const keys = await configuredIdentityRegistryKeys(user.providerIdentity);
  const [account, emailOwner] = await Promise.all([
    getStoredDocument(`users/${user.uid}`),
    getStoredDocument(keys.emailPath),
  ]);
  if (account) return "ready";
  const ownerUid = typeof emailOwner?.canonicalUid === "string" ? emailOwner.canonicalUid : "";
  if (ownerUid && ownerUid !== user.uid) return "identity_link_required";
  return "new_account";
}
