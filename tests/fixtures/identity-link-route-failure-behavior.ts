import assert from "node:assert/strict";

import { recordAuthenticationEvent } from "../../src/lib/auth-audit.ts";
import { unexpectedIdentityLinkResponse } from "../../src/lib/identity-link-route-failure.ts";

const auditLines: string[] = [];
const response = unexpectedIdentityLinkResponse(
  "The sign-in connection could not be completed.",
  (event) => recordAuthenticationEvent(event, (line) => auditLines.push(line)),
);
assert.equal(response.status, 503);
assert.equal(response.headers.get("Cache-Control"), "private, no-store");
const body = await response.json();
assert.deepEqual(Object.keys(body).sort(), ["correlationId", "error"]);
assert.equal(body.error, "The sign-in connection could not be completed.");
assert.match(body.correlationId, /^[0-9a-f-]{36}$/i);
assert.equal(auditLines.length, 1);
const audit = JSON.parse(auditLines[0]);
assert.deepEqual(Object.keys(audit).sort(), [
  "code",
  "correlationId",
  "environment",
  "outcome",
  "reason",
  "schemaVersion",
  "type",
]);
assert.equal(audit.code, "account.identity_link_failed");
assert.equal(audit.outcome, "denied");
assert.equal(audit.reason, "internal_error");
assert.equal(audit.correlationId, body.correlationId);
assert(!JSON.stringify({ body, audit }).includes("private-uid"));
assert(!JSON.stringify({ body, audit }).includes("private-token"));
console.log("IDENTITY_LINK_ROUTE_FAILURE_BEHAVIOR_OK");
