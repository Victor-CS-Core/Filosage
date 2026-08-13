import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { STRICT_TRANSPORT_SECURITY, securityHeaders } from "../src/lib/security-headers";
import { contentReportDisposition } from "../src/lib/content-report-policy";

test("routes paid Terms billing questions to the approved disclosure inbox", () => {
  const termsSource = readFileSync("src/app/terms/page.tsx", "utf8");
  expect(termsSource).toContain("const billingSupportEmail = disclosure.ready ? disclosure.supportEmail : SUPPORT_CONTACT;");
  expect(termsSource).toContain("mailto:${billingSupportEmail}");
  expect(termsSource).not.toContain("Questions about plans, billing, cancellation, or refunds can be sent to <a href={`mailto:${SUPPORT_CONTACT}`}");
});

test("defines one production HSTS policy for pages, APIs, and assets", () => {
  expect(STRICT_TRANSPORT_SECURITY).toBe("max-age=63072000; includeSubDomains; preload");
  expect(securityHeaders(false, undefined, true)).toContainEqual({
    key: "Strict-Transport-Security",
    value: STRICT_TRANSPORT_SECURITY,
  });
  expect(securityHeaders(false, undefined, false)).not.toContainEqual({
    key: "Strict-Transport-Security",
    value: STRICT_TRANSPORT_SECURITY,
  });
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
