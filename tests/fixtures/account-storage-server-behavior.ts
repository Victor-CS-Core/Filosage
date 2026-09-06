import assert from "node:assert/strict";
import { mock } from "node:test";
import * as documents from "../../src/lib/document-store.ts";
import { identityRegistryKeys } from "../../src/lib/identity-link-policy.ts";
import type { StoredDocument } from "../../src/lib/document-store.ts";

const identity = {
  provider: "google" as const, issuer: "https://accounts.google.com", subject: "provider-subject-B",
  email: "learner-b@example.com", emailVerified: true as const,
};
const keys = await identityRegistryKeys(identity, "account-storage-test-secret-32-characters");
// Only the external registry read is replaced. Principal verification, registry
// keying, canonical resolution and the authorization boundary remain real.
const fixtureDocuments = {
  ...documents,
  getStoredDocument: async (path: string): Promise<StoredDocument | null> => path === keys.identityPath ? {
    id: keys.identityPath.split("/").at(-1)!, schemaVersion: 1, keyVersion: "v1", identityHash: keys.identityHash,
    canonicalUid: "canonical-B", provider: "google", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  } : null,
};
// Node 22 supports module mocks behind its test flag; this repo's Node 20 type
// definitions do not yet include that test-runner method.
(mock as unknown as { module(path: string, options: { namedExports: typeof fixtureDocuments }): void }).module(
  new URL("../../src/lib/document-store.ts", import.meta.url).href,
  { namedExports: fixtureDocuments },
);
const { getVerifiedUser, requireUser } = await import("../../src/lib/auth-server.ts");
const principal = Buffer.from(JSON.stringify({ auth_typ: "google", claims: [
  { typ: "iss", val: identity.issuer }, { typ: "sub", val: identity.subject }, { typ: "email", val: identity.email },
  { typ: "email_verified", val: "true" },
] })).toString("base64");
const rows: Array<[string | undefined, string | null]> = [
  [undefined, "canonical-B"],
  ["azure-easy-auth-session", "canonical-B"],
  ["azure-easy-auth-session.v1:canonical-B", "canonical-B"],
  ["azure-easy-auth-session.v1:canonical-A", null],
  ["azure-easy-auth-session.v1:provider-subject-B", null],
  ["azure-easy-auth-session.v1:", null],
  ["azure-easy-auth-session.v1:%", null],
  ["azure-easy-auth-session.v2:canonical-B", null],
  ["azure-easy-auth-session.v1:canonical-B,canonical-A", null],
];
for (const [token, expectedUid] of rows) {
  const headers: Record<string, string> = { "x-ms-client-principal": principal, "x-ms-client-principal-idp": "google" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const request = new Request("https://filosage.invalid/api/learner-state", { method: "PUT", headers });
  assert.equal((await getVerifiedUser(request))?.uid ?? null, expectedUid, token);
  if (expectedUid === null) await assert.rejects(requireUser(request), { status: 401 });
  else assert.equal((await requireUser(request)).uid, expectedUid);
}
assert.equal(await getVerifiedUser(new Request("https://filosage.invalid/api/learner-state", {
  headers: { Authorization: "Bearer azure-easy-auth-session.v1:canonical-B" },
})), null);
console.log("ACCOUNT_STORAGE_DEPLOYED_IDENTITY_OK");
