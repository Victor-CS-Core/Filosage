import { expect, test } from "@playwright/test";
import {
  assertFreshDirectGoogleLinkAuthentication,
  assertFreshExternalLinkAuthentication,
  canonicalIdentityFromRegistry,
  completeIdentityLinkTransactionPlan,
  createIdentityLinkTransactionPlan,
  ExternalIdSignupUnavailableError,
  IdentityLinkRequiredError,
  IdentityRegistryConflictError,
  identityOnboardingStateFromRegistry,
  identityRegistrationWrites,
  identityRegistryKeys,
  LinkIntentError,
  linkIntentPath,
  normalizedVerifiedEmail,
  prepareIdentityRegistration,
  safeAuthenticationReturnPath,
  validateLinkCompletion,
} from "../src/lib/identity-link-policy";
import type { VerifiedProviderIdentity, VerifiedUser } from "../src/lib/identity-types";

const identity: VerifiedProviderIdentity = {
  provider: "filosage",
  issuer: "https://qa-filosage.ciamlogin.com/11111111-1111-1111-1111-111111111111/v2.0",
  subject: "external-subject",
  email: "Learner@Example.com",
  emailVerified: true,
};

const unregisteredUser: VerifiedUser = {
  uid: "external-subject",
  email: "learner@example.com",
  email_verified: true,
  providerIdentity: identity,
  identityLinkRegistered: false,
};

const testSecret = "test-secret-with-at-least-32-characters";
const now = Date.parse("2026-08-18T12:05:00.000Z");
const nowSeconds = Math.floor(now / 1_000);

function documentId(path: string) {
  return path.split("/").at(-1) ?? "";
}

function exactIdentityRegistryDocument(
  path: string,
  keys: Awaited<ReturnType<typeof identityRegistryKeys>>,
  canonicalUid: string,
  provider: VerifiedProviderIdentity["provider"],
) {
  return {
    id: documentId(path),
    schemaVersion: 1,
    keyVersion: "v1",
    identityHash: keys.identityHash,
    canonicalUid,
    provider,
    createdAt: "2026-08-18T11:00:00.000Z",
    updatedAt: "2026-08-18T11:00:00.000Z",
  };
}

function exactEmailOwnerDocument(
  path: string,
  keys: Awaited<ReturnType<typeof identityRegistryKeys>>,
  canonicalUid: string,
) {
  return {
    id: documentId(path),
    schemaVersion: 1,
    keyVersion: "v1",
    emailHash: keys.emailHash,
    canonicalUid,
    createdAt: "2026-08-18T11:00:00.000Z",
    updatedAt: "2026-08-18T11:00:00.000Z",
  };
}

test("link-intent values are opaque HMAC keys and return paths stay same-origin", async () => {
  const token = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";
  const path = await linkIntentPath(token, testSecret);
  expect(path).toMatch(/^identityLinkIntents\/v1_[a-f0-9]{64}$/);
  expect(path).not.toContain(token);
  expect(safeAuthenticationReturnPath("/profile?linked=1")).toBe("/profile?linked=1");
  expect(safeAuthenticationReturnPath("https://attacker.invalid/steal")).toBe("/");
  expect(safeAuthenticationReturnPath("//attacker.invalid/steal")).toBe("/");
});

test("completion accepts only an exact unused intent before its expiry boundary", () => {
  const valid = {
    schemaVersion: 1,
    keyVersion: "v1",
    canonicalUid: "google-subject",
    sourceIdentityHash: "a".repeat(64),
    emailHash: "b".repeat(64),
    returnPath: "/profile",
    createdAt: "2026-08-18T12:00:00.000Z",
    expiresAt: "2026-08-18T12:10:00.000Z",
    usedAt: null,
  };
  expect(validateLinkCompletion(valid, "b".repeat(64), now)).toEqual({
    canonicalUid: "google-subject",
    returnPath: "/profile",
  });
  expect(() => validateLinkCompletion({
    ...valid,
    createdAt: "2026-08-18T11:55:00.000Z",
    expiresAt: new Date(now).toISOString(),
  }, "b".repeat(64), now)).toThrow(expect.objectContaining({ reason: "expired" }));
  expect(() => validateLinkCompletion({
    ...valid,
    usedAt: "2026-08-18T12:04:00.000Z",
    updatedAt: "2026-08-18T12:04:00.000Z",
  }, "b".repeat(64), now)).toThrow(expect.objectContaining({ reason: "replayed" }));
  for (const corrupt of [
    { ...valid, emailHash: "c".repeat(64) },
    { ...valid, expiresAt: new Date(now).toISOString() },
    { ...valid, usedAt: "2026-08-18T12:01:00.000Z" },
    { ...valid, usedAt: false },
    { ...valid, unexpected: true },
    { ...valid, schemaVersion: 2 },
  ]) {
    expect(() => validateLinkCompletion(corrupt, "b".repeat(64), now)).toThrow(LinkIntentError);
  }
});

test("intent creation requires fresh direct-Google authentication before planning a write", async () => {
  const sourceIdentity: VerifiedProviderIdentity = {
    provider: "google",
    issuer: "https://accounts.google.com",
    subject: "google-subject",
    email: "learner@example.com",
    emailVerified: true,
    authTime: nowSeconds,
  };
  const user: VerifiedUser = {
    uid: "google-subject",
    email: sourceIdentity.email,
    email_verified: true,
    auth_time: sourceIdentity.authTime,
    providerIdentity: sourceIdentity,
    identityLinkRegistered: true,
  };
  for (const authTime of [undefined, nowSeconds - 301]) {
    expect(() => assertFreshDirectGoogleLinkAuthentication({
      ...user,
      auth_time: authTime,
      providerIdentity: { ...sourceIdentity, authTime },
    }, now)).toThrow(LinkIntentError);
  }
  for (const corruptUser of [
    { ...user, email: "different@example.com" },
    { ...user, uid: "../another-account" },
  ]) {
    expect(() => assertFreshDirectGoogleLinkAuthentication(corruptUser, now))
      .toThrow(LinkIntentError);
  }
});

test("intent creation validates complete source registries before writing", async () => {
  const sourceIdentity: VerifiedProviderIdentity = {
    provider: "google",
    issuer: "https://accounts.google.com",
    subject: "google-subject",
    email: "learner@example.com",
    emailVerified: true,
    authTime: nowSeconds,
  };
  const user: VerifiedUser = {
    uid: sourceIdentity.subject,
    email: sourceIdentity.email,
    email_verified: true,
    auth_time: sourceIdentity.authTime,
    providerIdentity: sourceIdentity,
    identityLinkRegistered: true,
  };
  const keys = await identityRegistryKeys(sourceIdentity, testSecret);
  const base = {
    [keys.identityPath]: exactIdentityRegistryDocument(keys.identityPath, keys, user.uid, "google"),
    [keys.emailPath]: exactEmailOwnerDocument(keys.emailPath, keys, user.uid),
    [`users/${user.uid}`]: { id: user.uid, email: user.email },
  };
  for (const corruption of [
    { path: keys.identityPath, patch: { provider: "filosage" } },
    { path: keys.identityPath, patch: { identityHash: "wrong" } },
    { path: keys.emailPath, patch: { canonicalUid: "another-account" } },
    { path: keys.emailPath, patch: { unexpected: true } },
  ]) {
    const documents = {
      ...base,
      [corruption.path]: { ...base[corruption.path], ...corruption.patch },
    };
    expect(() => createIdentityLinkTransactionPlan(documents, {
      intentPath: "identityLinkIntents/v1_" + "d".repeat(64),
      keys,
      user,
      returnPath: "/profile",
      now,
    })).toThrow(LinkIntentError);
    expect(Object.keys(documents).some((path) => path.startsWith("identityLinkIntents/"))).toBe(false);
  }
});

test("completion is atomic single-use and refuses stale auth or a deleted account", async () => {
  const token = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";
  const sourceIdentity: VerifiedProviderIdentity = {
    provider: "google",
    issuer: "https://accounts.google.com",
    subject: "google-subject",
    email: "learner@example.com",
    emailVerified: true,
    authTime: nowSeconds,
  };
  const externalIdentity: VerifiedProviderIdentity = {
    provider: "filosage",
    issuer: "https://qa-filosage.ciamlogin.com/tenant/v2.0",
    subject: "external-subject",
    email: sourceIdentity.email,
    emailVerified: true,
    authTime: nowSeconds,
  };
  const [intentPath, sourceKeys, externalKeys] = await Promise.all([
    linkIntentPath(token, testSecret),
    identityRegistryKeys(sourceIdentity, testSecret),
    identityRegistryKeys(externalIdentity, testSecret),
  ]);
  const intent = {
    id: documentId(intentPath),
    schemaVersion: 1,
    keyVersion: "v1",
    canonicalUid: sourceIdentity.subject,
    sourceIdentityHash: sourceKeys.identityHash,
    emailHash: externalKeys.emailHash,
    returnPath: "/profile",
    createdAt: "2026-08-18T12:00:00.000Z",
    expiresAt: "2026-08-18T12:10:00.000Z",
    usedAt: null,
  };
  const seed = {
    [intentPath]: intent,
    [sourceKeys.identityPath]: exactIdentityRegistryDocument(
      sourceKeys.identityPath,
      sourceKeys,
      sourceIdentity.subject,
      "google",
    ),
    [externalKeys.emailPath]: exactEmailOwnerDocument(
      externalKeys.emailPath,
      externalKeys,
      sourceIdentity.subject,
    ),
    [`users/${sourceIdentity.subject}`]: { id: sourceIdentity.subject, email: sourceIdentity.email },
  };

  for (const authTime of [undefined, nowSeconds - 301]) {
    expect(() => assertFreshExternalLinkAuthentication(
      { ...externalIdentity, authTime },
      now,
    )).toThrow(LinkIntentError);
  }

  const completionInput = {
    intentPath,
    sourceIdentityPath: sourceKeys.identityPath,
    keys: externalKeys,
    identity: externalIdentity,
    candidateCanonicalUid: sourceIdentity.subject,
    sourceIdentityHash: sourceKeys.identityHash,
    now,
  };
  const deletedDocuments = { ...seed };
  delete deletedDocuments[`users/${sourceIdentity.subject}`];
  expect(() => completeIdentityLinkTransactionPlan(deletedDocuments, completionInput))
    .toThrow(LinkIntentError);
  expect(deletedDocuments[externalKeys.identityPath]).toBeUndefined();

  const serializedDocuments: Record<string, Record<string, unknown> | null> = { ...seed };
  const first = completeIdentityLinkTransactionPlan(serializedDocuments, completionInput);
  for (const write of first.writes) {
    serializedDocuments[write.path] = { ...write.data, id: documentId(write.path) };
  }
  expect(() => completeIdentityLinkTransactionPlan(serializedDocuments, completionInput))
    .toThrow(expect.objectContaining({ reason: "replayed" }));
  expect(serializedDocuments[externalKeys.identityPath]).toMatchObject({
    canonicalUid: sourceIdentity.subject,
    provider: "filosage",
  });
  expect(serializedDocuments[intentPath]?.usedAt).toBe("2026-08-18T12:05:00.000Z");

  const exactExisting = {
    ...seed,
    [externalKeys.identityPath]: exactIdentityRegistryDocument(
      externalKeys.identityPath,
      externalKeys,
      sourceIdentity.subject,
      "filosage",
    ),
  };
  const idempotent = completeIdentityLinkTransactionPlan(exactExisting, completionInput);
  expect(idempotent.writes.map((write) => write.path)).toEqual([intentPath]);
  for (const corrupt of [
    { ...exactExisting[externalKeys.identityPath], provider: "google" },
    { ...exactExisting[externalKeys.identityPath], unexpected: true },
    { ...exactExisting[externalKeys.identityPath], canonicalUid: "different-account" },
  ]) {
    expect(() => completeIdentityLinkTransactionPlan({
      ...seed,
      [externalKeys.identityPath]: corrupt,
    }, completionInput)).toThrow(LinkIntentError);
  }
});

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
    { canonicalUid: " existing-google-uid ", keyVersion: "v1", identityHash: keys.identityHash },
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
    { canonicalUid: ` ${user.uid} `, keyVersion: "v1", emailHash: keys.emailHash },
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

test("new account registration writes identity and email ownership to one canonical UID", async () => {
  const registration = await prepareIdentityRegistration(
    unregisteredUser,
    "test-secret-with-at-least-32-characters",
  );

  expect(identityRegistrationWrites(
    {},
    registration,
    "2026-08-18T12:00:00.000Z",
    { allowNewExternalAccounts: true },
  )).toEqual([
    expect.objectContaining({
      path: registration.identityPath,
      data: expect.objectContaining({ canonicalUid: "external-subject" }),
    }),
    expect.objectContaining({
      path: registration.emailPath,
      data: expect.objectContaining({ canonicalUid: "external-subject" }),
    }),
  ]);
});

test("an owned email never auto-links a second identity", async () => {
  const registration = await prepareIdentityRegistration(
    unregisteredUser,
    "test-secret-with-at-least-32-characters",
  );

  expect(() => identityRegistrationWrites(
    {
      [registration.emailPath]: {
        canonicalUid: "existing-google-uid",
        keyVersion: "v1",
        emailHash: registration.emailHash,
      },
    },
    registration,
    "2026-08-18T12:00:00.000Z",
    { allowNewExternalAccounts: true },
  )).toThrow(IdentityLinkRequiredError);
});

test("an inactive External ID signup gate cannot create a new account", async () => {
  const registration = await prepareIdentityRegistration(
    unregisteredUser,
    "test-secret-with-at-least-32-characters",
  );

  expect(() => identityRegistrationWrites(
    {},
    registration,
    "2026-08-18T12:00:00.000Z",
    { allowNewExternalAccounts: false },
  )).toThrow(ExternalIdSignupUnavailableError);
});

test("an unlinked External ID identity cannot claim an account created during registration", async () => {
  const registration = await prepareIdentityRegistration(
    unregisteredUser,
    "test-secret-with-at-least-32-characters",
  );

  expect(() => identityRegistrationWrites(
    { [`users/${registration.canonicalUid}`]: { uid: registration.canonicalUid } },
    registration,
    "2026-08-18T12:00:00.000Z",
    { allowNewExternalAccounts: true },
  )).toThrow(IdentityRegistryConflictError);
});

test("registration fails closed for every malformed present registry document", async () => {
  const registration = await prepareIdentityRegistration(
    unregisteredUser,
    "test-secret-with-at-least-32-characters",
  );
  const corruptLinks = [
    { keyVersion: "v1", identityHash: registration.identityHash },
    { canonicalUid: " ", keyVersion: "v1", identityHash: registration.identityHash },
    { canonicalUid: ` ${registration.canonicalUid} `, keyVersion: "v1", identityHash: registration.identityHash },
    { canonicalUid: "different-canonical-uid", keyVersion: "v1", identityHash: registration.identityHash },
    { canonicalUid: registration.canonicalUid, keyVersion: "v2", identityHash: registration.identityHash },
    { canonicalUid: registration.canonicalUid, keyVersion: "v1", identityHash: "wrong-hash" },
  ];
  const corruptOwners = [
    { keyVersion: "v1", emailHash: registration.emailHash },
    { canonicalUid: " ", keyVersion: "v1", emailHash: registration.emailHash },
    { canonicalUid: ` ${registration.canonicalUid} `, keyVersion: "v1", emailHash: registration.emailHash },
    { canonicalUid: registration.canonicalUid, keyVersion: "v2", emailHash: registration.emailHash },
    { canonicalUid: registration.canonicalUid, keyVersion: "v1", emailHash: "wrong-hash" },
  ];

  for (const link of corruptLinks) {
    expect(() => identityRegistrationWrites(
      { [registration.identityPath]: link },
      registration,
      "2026-08-18T12:00:00.000Z",
      { allowNewExternalAccounts: false },
    )).toThrow(IdentityRegistryConflictError);
  }
  for (const owner of corruptOwners) {
    expect(() => identityRegistrationWrites(
      { [registration.emailPath]: owner },
      registration,
      "2026-08-18T12:00:00.000Z",
      { allowNewExternalAccounts: false },
    )).toThrow(IdentityRegistryConflictError);
  }
});

test("a valid registered External ID or direct Google account preserves compatibility", async () => {
  const externalRegistration = await prepareIdentityRegistration(
    { ...unregisteredUser, identityLinkRegistered: true },
    "test-secret-with-at-least-32-characters",
  );
  const validLink = {
    canonicalUid: externalRegistration.canonicalUid,
    keyVersion: "v1",
    identityHash: externalRegistration.identityHash,
  };
  expect(identityRegistrationWrites(
    {
      [externalRegistration.identityPath]: validLink,
      [`users/${externalRegistration.canonicalUid}`]: { uid: externalRegistration.canonicalUid },
    },
    externalRegistration,
    "2026-08-18T12:00:00.000Z",
    { allowNewExternalAccounts: false },
  )).toEqual([
    expect.objectContaining({ path: externalRegistration.emailPath }),
  ]);

  const googleRegistration = await prepareIdentityRegistration({
    ...unregisteredUser,
    providerIdentity: {
      ...identity,
      provider: "google",
      issuer: "https://accounts.google.com",
      subject: "google-subject",
    },
    uid: "google-subject",
  }, "test-secret-with-at-least-32-characters");
  expect(identityRegistrationWrites(
    { [`users/${googleRegistration.canonicalUid}`]: { uid: googleRegistration.canonicalUid } },
    googleRegistration,
    "2026-08-18T12:00:00.000Z",
    { allowNewExternalAccounts: false },
  )).toEqual([
    expect.objectContaining({ path: googleRegistration.identityPath }),
    expect.objectContaining({ path: googleRegistration.emailPath }),
  ]);
});
