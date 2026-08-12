import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const infrastructureSource = readFileSync("src/lib/azure-infrastructure.ts", "utf8");
const releaseSource = readFileSync("scripts/check-release-env.mjs", "utf8");
const identityClientSource = readFileSync("src/lib/identity-client.ts", "utf8");

test("Azure infrastructure inventory names every production platform service", () => {
  expect(infrastructureSource).toContain("Microsoft Entra External ID");
  expect(infrastructureSource).toContain("Azure Database for PostgreSQL");
  expect(infrastructureSource).toContain("Azure Blob Storage");
  expect(infrastructureSource).toContain("Azure Container Apps");
  expect(infrastructureSource).toContain("Azure Monitor and Log Analytics");
});

test("production release validation requires Azure and does not require Firebase", () => {
  expect(releaseSource).toContain('"DATABASE_URL"');
  expect(releaseSource).toContain('"NEXT_PUBLIC_ENTRA_CLIENT_ID"');
  expect(releaseSource).toContain('"AZURE_STORAGE_ACCOUNT_URL"');
  expect(releaseSource).not.toContain('"FIREBASE_PROJECT_ID"');
  expect(releaseSource).not.toContain('"FIRESTORE_BACKUP_BUCKET"');
});

test("Azure status avoids presenting configuration as invoice or restore proof", () => {
  expect(infrastructureSource).toContain("not invoice-grade Azure cost");
  expect(infrastructureSource).toContain("configuration alone is not recovery proof");
});

test("customer sign-in accelerates to Google while retaining the External ID flow", () => {
  expect(identityClientSource).toContain('domain_hint: "google"');
  expect(identityClientSource).toContain("extraQueryParameters: googleIssuerHint");
  expect(identityClientSource).toContain('prompt: "select_account"');
});
