import { expect, test } from "@playwright/test";
import {
  canonicalIdentityFromRegistry,
  IdentityRegistryConflictError,
  identityOnboardingStateFromRegistry,
  identityRegistryKeys,
  normalizedVerifiedEmail,
} from "../src/lib/identity-link-policy";
import type { VerifiedProviderIdentity } from "../src/lib/identity-types";

const identity: VerifiedProviderIdentity = {
  provider: "filosage",
  issuer: "https://qa-filosage.ciamlogin.com/11111111-1111-1111-1111-111111111111/v2.0",
  subject: "external-subject",
  email: "Learner@Example.com",
  emailVerified: true,
};

test("identity and email registry paths are deterministic versioned HMACs", async () => {
  const first = await identityRegistryKeys(identity, "test-secret-with-at-least-32-characters");
  const second = await identityRegistryKeys(identity, "test-secret-with-at-least-32-characters");
  expect(second).toEqual(first);
  expect(first.identityPath).toMatch(/^identityLinks\/v1_[a-f0-9]{64}$/);
  expect(first.emailPath).toMatch(/^identityEmailOwners\/v1_[a-f0-9]{64}$/);
  expect(JSON.stringify(first)).not.toContain(identity.subject);
  expect(JSON.stringify(first)).not.toContain("learner@example.com");
});

test("issuer and provider are part of the identity key", async () => {
  const base = await identityRegistryKeys(identity, "test-secret-with-at-least-32-characters");
  const otherIssuer = await identityRegistryKeys(
    { ...identity, issuer: "https://production-filosage.ciamlogin.com/tenant/v2.0" },
    "test-secret-with-at-least-32-characters",
  );
  const otherProvider = await identityRegistryKeys(
    { ...identity, provider: "google" },
    "test-secret-with-at-least-32-characters",
  );
  expect(otherIssuer.identityPath).not.toBe(base.identityPath);
  expect(otherProvider.identityPath).not.toBe(base.identityPath);
  expect(otherIssuer.emailPath).toBe(base.emailPath);
});

test("email normalization changes case and surrounding whitespace only", () => {
  expect(normalizedVerifiedEmail(" Learner+Study@Gmail.com ")).toBe("learner+study@gmail.com");
  expect(normalizedVerifiedEmail("not-an-email")).toBeNull();
});

test("canonical identity policy preserves local fixtures, direct Google subjects, and registered mappings", async () => {
  const keys = await identityRegistryKeys(identity, "test-secret-with-at-least-32-characters");
  const localIdentity: VerifiedProviderIdentity = {
    ...identity,
    provider: "local",
    issuer: "https://local.filosage.invalid",
    subject: "local-learner",
  };
  const googleIdentity: VerifiedProviderIdentity = {
    ...identity,
    provider: "google",
    issuer: "https://accounts.google.com",
    subject: "google-subject",
  };
  const googleKeys = await identityRegistryKeys(
    googleIdentity,
    "test-secret-with-at-least-32-characters",
  );

  expect(canonicalIdentityFromRegistry(localIdentity, null, null, false)).toMatchObject({
    uid: "local-learner",
    identityLinkRegistered: true,
  });
  expect(canonicalIdentityFromRegistry(googleIdentity, googleKeys, null, true)).toMatchObject({
    uid: "google-subject",
    identityLinkRegistered: false,
  });
  expect(canonicalIdentityFromRegistry(identity, keys, {
    canonicalUid: "existing-google-uid",
    keyVersion: "v1",
    identityHash: keys.identityHash,
  }, false)).toMatchObject({
    uid: "existing-google-uid",
    identityLinkRegistered: true,
  });
});

test("unmapped External ID fails closed when its subject UID is already occupied", async () => {
  const keys = await identityRegistryKeys(identity, "test-secret-with-at-least-32-characters");

  expect(canonicalIdentityFromRegistry(identity, keys, null, false)).toMatchObject({
    uid: identity.subject,
    identityLinkRegistered: false,
  });
  expect(() => canonicalIdentityFromRegistry(identity, keys, null, true)).toThrow(
    IdentityRegistryConflictError,
  );
});

test("present identity mappings fail closed when canonical UID or key metadata is corrupt", async () => {
  const keys = await identityRegistryKeys(identity, "test-secret-with-at-least-32-characters");
  const corruptLinks = [
    { keyVersion: "v1", identityHash: keys.identityHash },
    { canonicalUid: " ", keyVersion: "v1", identityHash: keys.identityHash },
    { canonicalUid: "existing-google-uid", keyVersion: "v2", identityHash: keys.identityHash },
    { canonicalUid: "existing-google-uid", keyVersion: "v1", identityHash: "wrong-hash" },
  ];

  for (const link of corruptLinks) {
    expect(() => canonicalIdentityFromRegistry(identity, keys, link, false)).toThrow(
      IdentityRegistryConflictError,
    );
  }
});

test("onboarding distinguishes ready accounts, new accounts, and owned emails", async () => {
  const keys = await identityRegistryKeys(identity, "test-secret-with-at-least-32-characters");
  const user = canonicalIdentityFromRegistry(identity, keys, null, false);
  const owner = {
    canonicalUid: "existing-google-uid",
    keyVersion: "v1",
    emailHash: keys.emailHash,
  };

  expect(identityOnboardingStateFromRegistry(user, keys, null, null)).toBe("new_account");
  expect(identityOnboardingStateFromRegistry(user, keys, { uid: user.uid }, null)).toBe("ready");
  expect(identityOnboardingStateFromRegistry(user, keys, null, owner)).toBe(
    "identity_link_required",
  );
  expect(identityOnboardingStateFromRegistry(user, keys, null, {
    ...owner,
    canonicalUid: user.uid,
  })).toBe("new_account");
});

test("onboarding fails closed for malformed or conflicting email-owner documents", async () => {
  const keys = await identityRegistryKeys(identity, "test-secret-with-at-least-32-characters");
  const user = canonicalIdentityFromRegistry(identity, keys, null, false);
  const corruptOwners = [
    { keyVersion: "v1", emailHash: keys.emailHash },
    { canonicalUid: " ", keyVersion: "v1", emailHash: keys.emailHash },
    { canonicalUid: user.uid, keyVersion: "v2", emailHash: keys.emailHash },
    { canonicalUid: user.uid, keyVersion: "v1", emailHash: "wrong-hash" },
  ];

  for (const emailOwner of corruptOwners) {
    expect(() => identityOnboardingStateFromRegistry(
      user,
      keys,
      { uid: user.uid },
      emailOwner,
    )).toThrow(IdentityRegistryConflictError);
  }
  expect(() => identityOnboardingStateFromRegistry(user, keys, { uid: user.uid }, {
    canonicalUid: "different-canonical-uid",
    keyVersion: "v1",
    emailHash: keys.emailHash,
  })).toThrow(IdentityRegistryConflictError);
});
