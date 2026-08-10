import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  installRuntimeEnvironment,
  serverEnvironment,
} from "../src/lib/runtime-environment";
import { publicLegalDisclosure } from "../src/lib/legal-disclosure";
import {
  STRICT_TRANSPORT_SECURITY,
  withStrictTransportSecurity,
} from "../src/lib/security-headers";
import { contentReportDisposition } from "../src/lib/content-report-policy";

test("exposes Sites string bindings without serializing resource bindings", () => {
  const versionKey = "FILOSAGE_TEST_SITE_VERSION";
  const secretKey = "FILOSAGE_TEST_SITE_SECRET";
  const resourceKey = "FILOSAGE_TEST_SITE_RESOURCE";
  const previous = globalThis.__FILOSAGE_RUNTIME_ENV__;

  try {
    installRuntimeEnvironment({
      [versionKey]: "test-version",
      [secretKey]: "test-secret",
      [resourceKey]: { fetch() {} },
    });
    expect(serverEnvironment[versionKey]).toBe("test-version");
    expect(serverEnvironment[secretKey]).toBe("test-secret");
    expect(serverEnvironment[resourceKey]).toBeUndefined();
  } finally {
    globalThis.__FILOSAGE_RUNTIME_ENV__ = previous;
  }
});

test("renders public legal disclosures from Sites Worker bindings", () => {
  const previous = globalThis.__FILOSAGE_RUNTIME_ENV__;

  try {
    installRuntimeEnvironment({
      LEGAL_OPERATOR_NAME: "Filosage Test Operator",
      LEGAL_BUSINESS_ADDRESS: "100 Test Street, Test City",
      GOVERNING_JURISDICTION: "Test Jurisdiction",
      SUPPORT_EMAIL: "billing@example.test",
    });
    expect(publicLegalDisclosure()).toEqual({
      ready: true,
      operatorName: "Filosage Test Operator",
      businessAddress: "100 Test Street, Test City",
      governingJurisdiction: "Test Jurisdiction",
      supportEmail: "billing@example.test",
    });
  } finally {
    globalThis.__FILOSAGE_RUNTIME_ENV__ = previous;
  }
});

test("routes paid Terms billing questions to the approved disclosure inbox", () => {
  const termsSource = readFileSync("src/app/terms/page.tsx", "utf8");
  expect(termsSource).toContain("const billingSupportEmail = disclosure.ready ? disclosure.supportEmail : SUPPORT_CONTACT;");
  expect(termsSource).toContain("mailto:${billingSupportEmail}");
  expect(termsSource).not.toContain("Questions about plans, billing, cancellation, or refunds can be sent to <a href={`mailto:${SUPPORT_CONTACT}`}");
});

test("defines one production HSTS policy for pages, APIs, and assets", () => {
  expect(STRICT_TRANSPORT_SECURITY).toBe("max-age=63072000; includeSubDomains; preload");
  const secure = withStrictTransportSecurity(
    new Request("https://filosage.example/api/health"),
    Response.json({ ok: true }),
  );
  const local = withStrictTransportSecurity(
    new Request("http://127.0.0.1:3000/api/health"),
    Response.json({ ok: true }),
  );
  expect(secure.headers.get("strict-transport-security")).toBe(STRICT_TRANSPORT_SECURITY);
  expect(local.headers.get("strict-transport-security")).toBeNull();
});

test("learner reports escalate without granting unpublish authority", () => {
  expect(contentReportDisposition({
    courseIsPublic: true,
    serious: true,
    reporterIsOwner: false,
    seriousReporterCount: 2,
  })).toEqual({ quarantine: false, escalate: true });
  expect(contentReportDisposition({
    courseIsPublic: true,
    serious: true,
    reporterIsOwner: true,
    seriousReporterCount: 1,
  })).toEqual({ quarantine: true, escalate: false });
});
