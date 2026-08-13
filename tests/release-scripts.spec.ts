import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const root = process.cwd();
const releaseScript = resolve(root, "scripts/check-release-env.mjs");
const healthScript = resolve(root, "scripts/check-production-health.mjs");

const validReleaseEnvironment = {
  ...process.env,
  NEXT_PUBLIC_SITE_URL: "https://release.example",
  DATABASE_URL: "postgresql://release:placeholder@filosage-release.postgres.database.azure.com:5432/filosage?sslmode=verify-full",
  AZURE_EASY_AUTH_ENABLED: "true",
  AZURE_STORAGE_ACCOUNT_URL: "https://filosagerelease.blob.core.windows.net/",
  AZURE_STORAGE_BANNER_CONTAINER: "course-banners",
  AZURE_POSTGRES_SERVER_NAME: "filosage-release",
  AZURE_RESOURCE_GROUP: "filosage-release-rg",
  OPENAI_API_KEY: "release-check-placeholder",
  OWNER_EMAIL: "owner@release.example",
  ACTIVITY_RECEIPT_SECRET: "x".repeat(32),
  OPERATIONS_ALERT_WEBHOOK_URL: "https://alerts.release.example/filosage",
  OPERATIONS_ALERT_WEBHOOK_SECRET: "y".repeat(32),
  SITE_VERSION: "a".repeat(40),
  BILLING_ENABLED: "false",
};

test("release checks bind Azure and production health to one full Git SHA", ({ request }, testInfo) => {
  void request;
  test.skip(testInfo.project.name !== "chromium", "One process-level release contract is sufficient.");

  const valid = spawnSync(process.execPath, [releaseScript], {
    cwd: root,
    env: validReleaseEnvironment,
    encoding: "utf8",
  });
  expect(valid.status, valid.stderr).toBe(0);
  expect(valid.stdout).toContain("Closed-billing release environment looks complete");

  const missingRecovery = spawnSync(process.execPath, [releaseScript], {
    cwd: root,
    env: { ...validReleaseEnvironment, AZURE_POSTGRES_SERVER_NAME: "" },
    encoding: "utf8",
  });
  expect(missingRecovery.status).toBe(1);
  expect(missingRecovery.stderr).toContain("AZURE_POSTGRES_SERVER_NAME");

  const disabledEasyAuth = spawnSync(process.execPath, [releaseScript], {
    cwd: root,
    env: { ...validReleaseEnvironment, AZURE_EASY_AUTH_ENABLED: "false" },
    encoding: "utf8",
  });
  expect(disabledEasyAuth.status).toBe(1);
  expect(disabledEasyAuth.stderr).toContain("AZURE_EASY_AUTH_ENABLED must be true for production releases");

  const shortVersion = spawnSync(process.execPath, [releaseScript], {
    cwd: root,
    env: { ...validReleaseEnvironment, SITE_VERSION: "abcdef0" },
    encoding: "utf8",
  });
  expect(shortVersion.status).toBe(1);
  expect(shortVersion.stderr).toContain("full 40-character Git commit SHA");

  const missingExpectedVersion = spawnSync(process.execPath, [healthScript, "https://release.example"], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  expect(missingExpectedVersion.status).toBe(1);
  expect(missingExpectedVersion.stderr).toContain("Provide the exact deployed Git commit SHA");

  const abbreviatedExpectedVersion = spawnSync(process.execPath, [healthScript, "https://release.example", "abcdef0"], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  expect(abbreviatedExpectedVersion.status).toBe(1);
  expect(abbreviatedExpectedVersion.stderr).toContain("full 40-character Git commit SHA");
});

test("billing activation requires every Plus and Pro Stripe price", ({ request }, testInfo) => {
  void request;
  test.skip(testInfo.project.name !== "chromium", "One process-level release contract is sufficient.");

  const activationEnvironment = {
    ...validReleaseEnvironment,
    BILLING_ENABLED: "true",
    BILLING_PROVIDER: "stripe",
    STRIPE_SECRET_KEY: "sk_live_1234567890AbCdEfGhIjKlMn",
    STRIPE_WEBHOOK_SECRET: "whsec_1234567890AbCdEfGhIjKlMn",
    STRIPE_PLUS_MONTHLY_PRICE_ID: "price_1PlusMonthlyAbCd",
    STRIPE_PLUS_ANNUAL_PRICE_ID: "price_1PlusAnnualAbCd",
    STRIPE_PRO_MONTHLY_PRICE_ID: "price_1ProMonthlyAbCd",
    STRIPE_PRO_ANNUAL_PRICE_ID: "price_1ProAnnualAbCd",
    LEGAL_OPERATOR_NAME: "Filosage LLC",
    LEGAL_BUSINESS_ADDRESS: "123 Example Street",
    GOVERNING_JURISDICTION: "New York",
    SUPPORT_EMAIL: "support@filosage.com",
  };
  for (const variable of ["STRIPE_PLUS_MONTHLY_PRICE_ID", "STRIPE_PLUS_ANNUAL_PRICE_ID", "STRIPE_PRO_MONTHLY_PRICE_ID", "STRIPE_PRO_ANNUAL_PRICE_ID"]) {
    const result = spawnSync(process.execPath, [releaseScript, "--billing-activation"], {
      cwd: root,
      env: { ...activationEnvironment, [variable]: "" },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${variable} is required for billing activation`);
  }
  for (const variable of ["LEGAL_OPERATOR_NAME", "LEGAL_BUSINESS_ADDRESS", "GOVERNING_JURISDICTION", "SUPPORT_EMAIL"]) {
    const result = spawnSync(process.execPath, [releaseScript, "--billing-activation"], {
      cwd: root,
      env: { ...activationEnvironment, [variable]: "" },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${variable} is required for billing activation`);
  }
  const malformedSupportEmail = spawnSync(process.execPath, [releaseScript, "--billing-activation"], {
    cwd: root,
    env: { ...activationEnvironment, SUPPORT_EMAIL: "not-an-email" },
    encoding: "utf8",
  });
  expect(malformedSupportEmail.status).toBe(1);
  expect(malformedSupportEmail.stderr).toContain("SUPPORT_EMAIL must be a valid email address");
  const wrongProvider = spawnSync(process.execPath, [releaseScript, "--billing-activation"], {
    cwd: root,
    env: { ...activationEnvironment, BILLING_PROVIDER: "none" },
    encoding: "utf8",
  });
  expect(wrongProvider.status).toBe(1);
  expect(wrongProvider.stderr).toContain("BILLING_PROVIDER must be stripe for billing activation");
  for (const [variable, value, message] of [
    ["STRIPE_SECRET_KEY", "sk_test_1234567890AbCdEfGhIjKlMn", "STRIPE_SECRET_KEY must be a non-placeholder Live secret or restricted key"],
    ["STRIPE_SECRET_KEY", "sk_live_placeholder", "STRIPE_SECRET_KEY must be a non-placeholder Live secret or restricted key"],
    ["STRIPE_WEBHOOK_SECRET", "whsec_placeholder", "STRIPE_WEBHOOK_SECRET must be a non-placeholder whsec_ signing secret"],
    ["STRIPE_PLUS_MONTHLY_PRICE_ID", "not_a_price", "STRIPE_PLUS_MONTHLY_PRICE_ID must be a valid Stripe Price ID"],
  ] as const) {
    const result = spawnSync(process.execPath, [releaseScript, "--billing-activation"], {
      cwd: root,
      env: { ...activationEnvironment, [variable]: value },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  }
  const duplicatePrice = spawnSync(process.execPath, [releaseScript, "--billing-activation"], {
    cwd: root,
    env: {
      ...activationEnvironment,
      STRIPE_PRO_MONTHLY_PRICE_ID: activationEnvironment.STRIPE_PLUS_MONTHLY_PRICE_ID,
    },
    encoding: "utf8",
  });
  expect(duplicatePrice.status).toBe(1);
  expect(duplicatePrice.stderr).toContain("All four current Stripe Price IDs must be unique");
});
