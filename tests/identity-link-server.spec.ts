import { expect, test } from "@playwright/test";
import {
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
