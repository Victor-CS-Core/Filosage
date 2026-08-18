import { expect, test } from "@playwright/test";
import {
  authenticationConfigurationIssues,
  authenticationRuntimeConfiguration,
} from "../src/lib/auth-runtime";
import { easyAuthIdentityFromHeaders } from "../src/lib/easy-auth-principal";
import { verifiedEasyAuthUserFromProviderIdentity } from "../src/lib/easy-auth-user";

function principal(provider: string, claims: unknown) {
  return Buffer.from(JSON.stringify({ auth_typ: provider, claims })).toString("base64");
}

const dual = authenticationRuntimeConfiguration({
  NODE_ENV: "production",
  AZURE_EASY_AUTH_ENABLED: "true",
  DIRECT_GOOGLE_AUTH_ENABLED: "true",
  EXTERNAL_ID_AUTH_ENABLED: "true",
  EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: "false",
  EXTERNAL_ID_ISSUER: "https://qa-filosage.ciamlogin.com/11111111-1111-1111-1111-111111111111/v2.0",
});

test("runtime defaults retain direct Google while External ID migration is off", () => {
  expect(authenticationRuntimeConfiguration({})).toMatchObject({
    easyAuthEnabled: false,
    directGoogleEnabled: true,
    externalIdEnabled: false,
    externalIdNewAccountsEnabled: false,
    externalIdIssuer: null,
    directGoogleIssuer: "https://accounts.google.com",
  });
});

test("authentication configuration fails closed when no provider is enabled", () => {
  const config = authenticationRuntimeConfiguration({
    NODE_ENV: "production",
    AZURE_EASY_AUTH_ENABLED: "true",
    DIRECT_GOOGLE_AUTH_ENABLED: "false",
    EXTERNAL_ID_AUTH_ENABLED: "false",
    EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: "false",
  });
  expect(authenticationConfigurationIssues(config)).toContain(
    "At least one production authentication provider must be enabled.",
  );
});

test("new External ID accounts cannot be enabled before the provider", () => {
  const config = authenticationRuntimeConfiguration({
    NODE_ENV: "production",
    AZURE_EASY_AUTH_ENABLED: "true",
    DIRECT_GOOGLE_AUTH_ENABLED: "true",
    EXTERNAL_ID_AUTH_ENABLED: "false",
    EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: "true",
  });
  expect(authenticationConfigurationIssues(config)).toContain(
    "EXTERNAL_ID_NEW_ACCOUNTS_ENABLED requires EXTERNAL_ID_AUTH_ENABLED.",
  );
});

test("enabled External ID requires an issuer", () => {
  const config = authenticationRuntimeConfiguration({
    AZURE_EASY_AUTH_ENABLED: "true",
    EXTERNAL_ID_AUTH_ENABLED: "true",
  });
  expect(authenticationConfigurationIssues(config)).toContain(
    "EXTERNAL_ID_ISSUER is required when EXTERNAL_ID_AUTH_ENABLED is true.",
  );
});

test("parses exact enabled External ID claims into an issuer-qualified identity", () => {
  const headers = new Headers({
    "x-ms-client-principal-idp": "filosage",
    "x-ms-client-principal": principal("filosage", [
      { typ: "iss", val: dual.externalIdIssuer! },
      { typ: "sub", val: "external-subject" },
      { typ: "email", val: " Learner@Example.com " },
      { typ: "name", val: "Learner" },
      { typ: "auth_time", val: "1750000000" },
    ]),
  });
  expect(easyAuthIdentityFromHeaders(headers, dual)).toEqual({
    provider: "filosage",
    issuer: dual.externalIdIssuer,
    subject: "external-subject",
    email: "learner@example.com",
    emailVerified: true,
    authTime: 1_750_000_000,
    name: "Learner",
    picture: undefined,
  });
});

test("rejects disabled providers, wrong issuers, malformed email, and missing subjects", () => {
  const encoded = principal("filosage", [
    { typ: "iss", val: "https://attacker.invalid/v2.0" },
    { typ: "sub", val: "external-subject" },
    { typ: "email", val: "learner@example.com" },
  ]);
  expect(easyAuthIdentityFromHeaders(new Headers({
    "x-ms-client-principal-idp": "filosage",
    "x-ms-client-principal": encoded,
  }), dual)).toBeNull();
  const directGoogleDisabled = authenticationRuntimeConfiguration({
    AZURE_EASY_AUTH_ENABLED: "true",
    DIRECT_GOOGLE_AUTH_ENABLED: "false",
    EXTERNAL_ID_AUTH_ENABLED: "true",
    EXTERNAL_ID_ISSUER: dual.externalIdIssuer!,
  });
  expect(easyAuthIdentityFromHeaders(new Headers({
    "x-ms-client-principal-idp": "google",
    "x-ms-client-principal": principal("google", [
      { typ: "sub", val: "subject" },
      { typ: "email", val: "learner@example.com" },
    ]),
  }), directGoogleDisabled)).toBeNull();
  expect(easyAuthIdentityFromHeaders(new Headers({
    "x-ms-client-principal-idp": "filosage",
    "x-ms-client-principal": principal("filosage", [
      { typ: "iss", val: dual.externalIdIssuer! },
      { typ: "email", val: "learner@example.com" },
    ]),
  }), dual)).toBeNull();
  expect(easyAuthIdentityFromHeaders(new Headers({
    "x-ms-client-principal-idp": "filosage",
    "x-ms-client-principal": principal("filosage", [
      { typ: "iss", val: dual.externalIdIssuer! },
      { typ: "sub", val: "external-subject" },
      { typ: "email", val: "not-an-email" },
    ]),
  }), dual)).toBeNull();
});

test("rejects malformed Easy Auth claim elements without throwing", () => {
  expect(easyAuthIdentityFromHeaders(new Headers({
    "x-ms-client-principal-idp": "google",
    "x-ms-client-principal": principal("google", [null]),
  }), dual)).toBeNull();
});

test("normalizes case and surrounding whitespace without provider alias rewriting", () => {
  const headers = new Headers({
    "x-ms-client-principal-idp": "google",
    "x-ms-client-principal": principal("google", [
      { typ: "sub", val: "google-subject" },
      { typ: "email", val: " Learner+Study@Gmail.com " },
      { typ: "email_verified", val: "true" },
    ]),
  });
  expect(easyAuthIdentityFromHeaders(headers, dual)?.email).toBe("learner+study@gmail.com");
});

test("verified Easy Auth user bridge rejects raw External ID and preserves direct Google subjects", () => {
  const externalIdentity = {
    provider: "filosage" as const,
    issuer: dual.externalIdIssuer!,
    subject: "external-subject",
    email: "learner@example.com",
    emailVerified: true as const,
  };
  const googleIdentity = {
    provider: "google" as const,
    issuer: "https://accounts.google.com",
    subject: "google-canonical-subject",
    email: "learner@example.com",
    emailVerified: true as const,
  };

  expect(verifiedEasyAuthUserFromProviderIdentity(externalIdentity)).toBeNull();
  expect(verifiedEasyAuthUserFromProviderIdentity(googleIdentity)).toEqual({
    uid: "google-canonical-subject",
    email: "learner@example.com",
    email_verified: true,
    auth_time: undefined,
    name: undefined,
    picture: undefined,
    providerIdentity: googleIdentity,
    identityLinkRegistered: true,
  });
});
