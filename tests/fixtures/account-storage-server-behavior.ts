import assert from "node:assert/strict";
import { requestAccountMatchesVerifiedUid } from "../../src/lib/account-session.ts";

const rows: Array<[string | undefined, boolean]> = [
  [undefined, true],
  ["filosage-account-session", true],
  ["filosage-account-session.v1:canonical-B", true],
  ["filosage-account-session.v1:canonical-A", false],
  ["filosage-account-session.v1:provider-subject-B", false],
  ["filosage-account-session.v1:", false],
  ["filosage-account-session.v1:%", false],
  ["filosage-account-session.v2:canonical-B", false],
  ["filosage-account-session.v1:canonical-B,canonical-A", false],
];
for (const [token, expected] of rows) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const request = new Request("https://filosage.invalid/api/learner-state", { method: "PUT", headers });
  assert.equal(requestAccountMatchesVerifiedUid(request.headers, "canonical-B"), expected, token);
}
console.log("ACCOUNT_STORAGE_DEPLOYED_IDENTITY_OK");
