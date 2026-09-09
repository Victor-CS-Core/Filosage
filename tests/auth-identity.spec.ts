import { expect, test } from "@playwright/test";
import {
  authenticationConfigurationIssues,
  authenticationRuntimeConfiguration,
} from "../src/lib/auth-runtime";
import { easyAuthIdentityFromHeaders } from "../src/lib/easy-auth-principal";
import {
  normalizeDisplayName,
  providerDisplayName,
} from "../src/lib/display-name";

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

test("accepts Google identity only with exactly one true email-verification assertion", () => {
  const cases = [
    {
      name: "canonical true assertion",
      verificationClaims: [{ typ: "email_verified", val: "true" }],
      accepted: true,
    },
    {
      name: "normalized URN true assertion",
      verificationClaims: [{ typ: "URN:GOOGLE:EMAIL_VERIFIED", val: " TrUe " }],
      accepted: true,
    },
    {
      name: "missing assertion",
      verificationClaims: [],
      accepted: false,
    },
    {
      name: "false assertion with case and whitespace variation",
      verificationClaims: [{ typ: "email_verified", val: " FaLsE " }],
      accepted: false,
    },
    {
      name: "non-string boolean assertion",
      verificationClaims: [{ typ: "email_verified", val: true }],
      accepted: false,
    },
    {
      name: "unrecognized assertion value",
      verificationClaims: [{ typ: "email_verified", val: "yes" }],
      accepted: false,
    },
    {
      name: "duplicate canonical true assertions",
      verificationClaims: [
        { typ: "email_verified", val: "true" },
        { typ: "email_verified", val: "true" },
      ],
      accepted: false,
    },
    {
      name: "duplicate recognized true assertions across names",
      verificationClaims: [
        { typ: "email_verified", val: "true" },
        { typ: "urn:google:email_verified", val: "TRUE" },
      ],
      accepted: false,
    },
    {
      name: "conflicting canonical true and URN false assertions",
      verificationClaims: [
        { typ: "email_verified", val: "true" },
        { typ: "urn:google:email_verified", val: "false" },
      ],
      accepted: false,
    },
    {
      name: "conflicting canonical false and URN true assertions",
      verificationClaims: [
        { typ: "email_verified", val: "false" },
        { typ: "urn:google:email_verified", val: "true" },
      ],
      accepted: false,
    },
  ];

  for (const scenario of cases) {
    const headers = new Headers({
      "x-ms-client-principal-idp": "google",
      "x-ms-client-principal": principal("google", [
        { typ: "iss", val: dual.directGoogleIssuer },
        { typ: "sub", val: "google-subject" },
        { typ: "email", val: "learner@example.com" },
        ...scenario.verificationClaims,
      ]),
    });
    const identity = easyAuthIdentityFromHeaders(headers, dual);
    if (scenario.accepted) {
      expect.soft(identity, scenario.name).toEqual({
        provider: "google",
        issuer: dual.directGoogleIssuer,
        subject: "google-subject",
        email: "learner@example.com",
        emailVerified: true,
        authTime: undefined,
        name: undefined,
        picture: undefined,
      });
    } else {
      expect.soft(identity, scenario.name).toBeNull();
    }
  }
});

test("normalizes learner names without accepting provider placeholders or identity data", () => {
  expect(normalizeDisplayName("  Avery\t  N.  ")).toBe("Avery N.");
  expect(normalizeDisplayName("Ａｖｅｒｙ")).toBe("Avery");
  expect(normalizeDisplayName("unknown")).toBeNull();
  expect(normalizeDisplayName("ＵＮＫＮＯＷＮ")).toBeNull();
  expect(normalizeDisplayName("Avery\u0000Learner")).toBeNull();
  expect(normalizeDisplayName("a".repeat(81))).toBeNull();
  expect(providerDisplayName("learner@example.com", "learner@example.com")).toBeNull();
  expect(providerDisplayName("  Managed   Learner ", "learner@example.com")).toBe("Managed Learner");
});
