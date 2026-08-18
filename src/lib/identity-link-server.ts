import "server-only";

import { getStoredDocument } from "@/lib/firebase-server";
import {
  canonicalIdentityFromRegistry,
  identityOnboardingStateFromRegistry,
  identityRegistryKeys as identityRegistryKeysWithSecret,
} from "@/lib/identity-link-policy";
import type { VerifiedProviderIdentity, VerifiedUser } from "@/lib/identity-types";
import { isLocalMode } from "@/lib/local-mode";
import { serverEnvironment } from "@/lib/runtime-environment";

export {
  IdentityLinkRequiredError,
  IdentityRegistryConflictError,
} from "@/lib/identity-link-policy";
export type { IdentityOnboardingState } from "@/lib/identity-link-policy";

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

export async function resolveCanonicalIdentity(identity: VerifiedProviderIdentity) {
  if (identity.provider === "local") {
    return canonicalIdentityFromRegistry(identity, null, null, false);
  }
  const keys = await configuredIdentityRegistryKeys(identity);
  const link = await getStoredDocument(keys.identityPath);
  const subjectAccount = link === null && identity.provider === "filosage"
    ? await getStoredDocument(`users/${identity.subject}`)
    : null;
  return canonicalIdentityFromRegistry(identity, keys, link, subjectAccount !== null);
}

export async function identityOnboardingState(user: VerifiedUser) {
  const keys = await configuredIdentityRegistryKeys(user.providerIdentity);
  const [account, emailOwner] = await Promise.all([
    getStoredDocument(`users/${user.uid}`),
    getStoredDocument(keys.emailPath),
  ]);
  return identityOnboardingStateFromRegistry(user, keys, account, emailOwner);
}
