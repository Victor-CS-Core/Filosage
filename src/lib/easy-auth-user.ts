import type { VerifiedProviderIdentity, VerifiedUser } from "@/lib/identity-types";

/**
 * Temporary compatibility bridge until Task 2 resolves every provider identity
 * through the canonical identity-link registry. External ID remains fail-closed.
 */
export function verifiedEasyAuthUserFromProviderIdentity(
  providerIdentity: VerifiedProviderIdentity | null,
): VerifiedUser | null {
  if (!providerIdentity || providerIdentity.provider !== "google") return null;
  return {
    uid: providerIdentity.subject,
    email: providerIdentity.email,
    email_verified: true,
    auth_time: providerIdentity.authTime,
    name: providerIdentity.name,
    picture: providerIdentity.picture,
    providerIdentity,
    identityLinkRegistered: true,
  };
}
