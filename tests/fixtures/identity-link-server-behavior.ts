import assert from "node:assert/strict";

import {
  recordAuthenticationEvent,
  type AuthenticationAuditEvent,
} from "../../src/lib/auth-audit.ts";
import { requireProviderIdentity } from "../../src/lib/auth-server.ts";
import type { StoredDocument } from "../../src/lib/firebase-server.ts";
import {
  completeIdentityLinkIntent,
  createIdentityLinkIntent,
  type IdentityLinkDependencies,
} from "../../src/lib/identity-link-server.ts";
import {
  identityRegistryKeys,
  linkIntentPath,
  LinkIntentError,
} from "../../src/lib/identity-link-policy.ts";
import type {
  VerifiedProviderIdentity,
  VerifiedUser,
} from "../../src/lib/identity-types.ts";

const secret = "test-secret-with-at-least-32-characters";
const now = Date.parse("2026-08-18T12:05:00.000Z");
const nowSeconds = Math.floor(now / 1_000);
const token = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";

function id(path: string) {
  return path.split("/").at(-1) ?? "";
}

function transactionDocuments(
  paths: string[],
  read: (path: string) => Record<string, unknown> | null | undefined,
) {
  return Object.fromEntries(paths.map((path) => [path, read(path) ?? null])) as Record<
    string,
    StoredDocument | null
  >;
}

function identityDocument(
  path: string,
  identityHash: string,
  canonicalUid: string,
  provider: VerifiedProviderIdentity["provider"],
) {
  return {
    id: id(path),
    schemaVersion: 1,
    keyVersion: "v1",
    identityHash,
    canonicalUid,
    provider,
    createdAt: "2026-08-18T11:00:00.000Z",
    updatedAt: "2026-08-18T11:00:00.000Z",
  };
}

function emailDocument(path: string, emailHash: string, canonicalUid: string) {
  return {
    id: id(path),
    schemaVersion: 1,
    keyVersion: "v1",
    emailHash,
    canonicalUid,
    createdAt: "2026-08-18T11:00:00.000Z",
    updatedAt: "2026-08-18T11:00:00.000Z",
  };
}

function deployedPrincipal() {
  return Buffer.from(JSON.stringify({
    auth_typ: "filosage",
    claims: [
      { typ: "iss", val: "https://qa-filosage.ciamlogin.com/tenant/v2.0" },
      { typ: "sub", val: "external-subject" },
      { typ: "email", val: "learner@example.com" },
      { typ: "auth_time", val: String(nowSeconds) },
    ],
  })).toString("base64");
}

async function verifyDeployedProviderParsing() {
  const request = new Request("https://filosage.invalid/api", {
    headers: {
      "x-ms-client-principal": deployedPrincipal(),
      "x-ms-client-principal-idp": "filosage",
      "x-ms-client-principal-name": "learner@example.com",
    },
  });
  const identity = await requireProviderIdentity(request);
  assert.deepEqual(identity, {
    provider: "filosage",
    issuer: "https://qa-filosage.ciamlogin.com/tenant/v2.0",
    subject: "external-subject",
    email: "learner@example.com",
    emailVerified: true,
    authTime: nowSeconds,
    name: undefined,
    picture: undefined,
  });
  await assert.rejects(requireProviderIdentity(new Request("https://filosage.invalid/api", {
    headers: {
      "x-ms-client-principal": Buffer.from(JSON.stringify({
        auth_typ: "filosage",
        claims: [
          { typ: "iss", val: "https://attacker.invalid/tenant/v2.0" },
          { typ: "sub", val: "external-subject" },
          { typ: "email", val: "learner@example.com" },
        ],
      })).toString("base64"),
      "x-ms-client-principal-idp": "filosage",
    },
  })));

  let adapterCalls = 0;
  const source: VerifiedProviderIdentity = {
    provider: "google",
    issuer: "https://accounts.google.com",
    subject: "google-subject",
    email: "learner@example.com",
    emailVerified: true,
    authTime: nowSeconds,
  };
  const user: VerifiedUser = {
    uid: source.subject,
    email: source.email,
    email_verified: true,
    auth_time: source.authTime,
    providerIdentity: source,
    identityLinkRegistered: true,
  };
  await assert.rejects(createIdentityLinkIntent(user, "/", {
    now,
    token,
    dependencies: {
      secret,
      runTransaction: async () => { adapterCalls += 1; throw new Error("must not run"); },
      getDocument: async () => { adapterCalls += 1; return null; },
      recordEvent: () => { adapterCalls += 1; return true; },
    },
  }), /test dependencies are unavailable/i);
  assert.equal(adapterCalls, 0);
  console.log("REQUIRE_PROVIDER_IDENTITY_DEPLOYED_OK");
}

async function verifyLocalServerBehavior() {
  await assert.rejects(requireProviderIdentity(new Request("http://localhost/api", {
    headers: {
      "x-ms-client-principal": deployedPrincipal(),
      "x-ms-client-principal-idp": "filosage",
    },
  })));
  const localIdentity = await requireProviderIdentity(new Request("http://localhost/api", {
    headers: { Authorization: "Bearer playwright-external-signup-disabled" },
  }));
  assert.equal(localIdentity.provider, "filosage");
  assert.equal(localIdentity.emailVerified, true);

  const source: VerifiedProviderIdentity = {
    provider: "google",
    issuer: "https://accounts.google.com",
    subject: "google-subject",
    email: "learner@example.com",
    emailVerified: true,
    authTime: nowSeconds,
  };
  const user: VerifiedUser = {
    uid: source.subject,
    email: source.email,
    email_verified: true,
    auth_time: source.authTime,
    providerIdentity: source,
    identityLinkRegistered: true,
  };
  const sourceKeys = await identityRegistryKeys(source, secret);
  const intentPath = await linkIntentPath(token, secret);
  const sourceSeed = {
    [sourceKeys.identityPath]: identityDocument(
      sourceKeys.identityPath,
      sourceKeys.identityHash,
      user.uid,
      "google",
    ),
    [sourceKeys.emailPath]: emailDocument(sourceKeys.emailPath, sourceKeys.emailHash, user.uid),
    [`users/${user.uid}`]: { id: user.uid, email: user.email },
  };

  const forbiddenCalls: string[] = [];
  await assert.rejects(createIdentityLinkIntent({ ...user, uid: "another-safe-uid" }, "/", {
    now,
    token,
    dependencies: {
      secret,
      getDocument: async () => { forbiddenCalls.push("get"); return null; },
      runTransaction: async () => { forbiddenCalls.push("transaction"); throw new Error("called"); },
      recordEvent: () => { forbiddenCalls.push("audit"); return true; },
    },
  }), LinkIntentError);
  assert.deepEqual(forbiddenCalls, []);

  let creationCommitted = false;
  let creationWrites: Array<{ path: string; data: Record<string, unknown> }> = [];
  const creationEvents: AuthenticationAuditEvent[] = [];
  const creationDependencies: IdentityLinkDependencies = {
    secret,
    getDocument: async () => { throw new Error("creation must not pre-read"); },
    runTransaction: async (paths, update) => {
      assert.deepEqual(paths, [
        intentPath,
        sourceKeys.identityPath,
        sourceKeys.emailPath,
        `users/${user.uid}`,
      ]);
      const next = update(transactionDocuments(paths, (path) => sourceSeed[path]));
      creationWrites = next.writes;
      creationCommitted = true;
      return next.result;
    },
    recordEvent: (event) => {
      assert.equal(creationCommitted, true);
      creationEvents.push(event);
      return false;
    },
  };
  const created = await createIdentityLinkIntent(user, "/profile", {
    now,
    token,
    dependencies: creationDependencies,
  });
  assert.equal(created.token, token);
  assert.deepEqual(creationWrites.map((write) => write.path), [intentPath]);
  assert.deepEqual(Object.keys(creationEvents[0]).sort(), [
    "actorKey",
    "code",
    "correlationId",
    "outcome",
  ]);
  assert.match(String(creationEvents[0].actorKey), /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(creationEvents[0]), /google-subject|learner@example|external-subject/);

  await createIdentityLinkIntent(user, "/profile", {
    now,
    token: "1123456789abcdefghijklmnopqrstuvwxyzABCDEFG",
    dependencies: {
      secret,
      getDocument: async () => { throw new Error("creation must not pre-read"); },
      runTransaction: async (paths, update) => update(transactionDocuments(
        paths,
        (path) => sourceSeed[path],
      )).result,
      recordEvent: () => { throw new Error("audit transport unavailable"); },
    },
  });

  const external: VerifiedProviderIdentity = {
    provider: "filosage",
    issuer: "https://qa-filosage.ciamlogin.com/tenant/v2.0",
    subject: "external-subject",
    email: source.email,
    emailVerified: true,
    authTime: nowSeconds,
  };
  const externalKeys = await identityRegistryKeys(external, secret);
  const intent = {
    id: id(intentPath),
    schemaVersion: 1,
    keyVersion: "v1",
    canonicalUid: user.uid,
    sourceIdentityHash: sourceKeys.identityHash,
    emailHash: externalKeys.emailHash,
    returnPath: "/profile",
    createdAt: "2026-08-18T12:00:00.000Z",
    expiresAt: "2026-08-18T12:10:00.000Z",
    usedAt: null,
  };
  const completionSeed: Record<string, Record<string, unknown>> = {
    [intentPath]: intent,
    [sourceKeys.identityPath]: sourceSeed[sourceKeys.identityPath],
    [externalKeys.emailPath]: emailDocument(externalKeys.emailPath, externalKeys.emailHash, user.uid),
    [`users/${user.uid}`]: sourceSeed[`users/${user.uid}`],
  };
  const expectedCompletionPaths = [
    intentPath,
    sourceKeys.identityPath,
    externalKeys.identityPath,
    externalKeys.emailPath,
    `users/${user.uid}`,
  ];
  let completionCommitted = false;
  let completionWrites: Array<{ path: string; data: Record<string, unknown> }> = [];
  const completionEvents: AuthenticationAuditEvent[] = [];
  const completionDependencies: IdentityLinkDependencies = {
    secret,
    getDocument: async (path) => {
      assert.equal(path, intentPath);
      return completionSeed[path] as never;
    },
    runTransaction: async (paths, update) => {
      assert.deepEqual(paths, expectedCompletionPaths);
      const next = update(transactionDocuments(paths, (path) => completionSeed[path]));
      completionWrites = next.writes;
      completionCommitted = true;
      return next.result;
    },
    recordEvent: (event) => {
      assert.equal(completionCommitted, true);
      completionEvents.push(event);
      throw new Error("audit transport unavailable");
    },
  };
  const completed = await completeIdentityLinkIntent(token, external, {
    now,
    dependencies: completionDependencies,
  });
  assert.equal(completed.canonicalUid, user.uid);
  assert.deepEqual(completionWrites.map((write) => write.path), [
    externalKeys.identityPath,
    intentPath,
  ]);
  assert.equal(completionEvents.length, 1);
  assert.doesNotMatch(JSON.stringify(completionEvents[0]), /google-subject|learner@example|external-subject/);

  for (const corruption of [
    { [`users/${user.uid}`]: null },
    { [sourceKeys.identityPath]: { ...completionSeed[sourceKeys.identityPath], unexpected: true } },
    { [intentPath]: { ...intent, unexpected: true } },
  ]) {
    let writes = 0;
    let audits = 0;
    await assert.rejects(completeIdentityLinkIntent(token, external, {
      now,
      dependencies: {
        secret,
        getDocument: async () => intent as never,
        runTransaction: async (paths, update) => {
          const documents = transactionDocuments(paths, (path) =>
            path in corruption ? corruption[path] : completionSeed[path]);
          const next = update(documents);
          writes += next.writes.length;
          return next.result;
        },
        recordEvent: () => { audits += 1; return true; },
      },
    }), LinkIntentError);
    assert.equal(writes, 0);
    assert.equal(audits, 0);
  }

  const shared = new Map(Object.entries(completionSeed));
  let queue = Promise.resolve();
  const concurrentDependencies: IdentityLinkDependencies = {
    secret,
    getDocument: async (path) => shared.get(path) as never,
    runTransaction: async (paths, update) => {
      const prior = queue;
      let release = () => {};
      queue = new Promise<void>((resolve) => { release = resolve; });
      await prior;
      try {
        const next = update(transactionDocuments(paths, (path) => shared.get(path)));
        for (const write of next.writes) shared.set(write.path, { ...write.data, id: id(write.path) });
        return next.result;
      } finally {
        release();
      }
    },
    recordEvent: () => true,
  };
  const outcomes = await Promise.allSettled([
    completeIdentityLinkIntent(token, external, { now, dependencies: concurrentDependencies }),
    completeIdentityLinkIntent(token, external, { now, dependencies: concurrentDependencies }),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const replay = outcomes.find((outcome) => outcome.status === "rejected");
  assert(replay && replay.status === "rejected");
  assert(replay.reason instanceof LinkIntentError);
  assert.equal(replay.reason.reason, "replayed");

  const auditLines: string[] = [];
  const auditEvent = {
    code: "account.identity_link_succeeded" as const,
    outcome: "allowed" as const,
    correlationId: "123e4567-e89b-42d3-a456-426614174000",
    actorKey: "a".repeat(64),
    uid: "must-not-log",
    token: "must-not-log",
  };
  assert.equal(recordAuthenticationEvent(auditEvent, (line) => auditLines.push(line)), true);
  assert.deepEqual(Object.keys(JSON.parse(auditLines[0])).sort(), [
    "actorKey",
    "code",
    "correlationId",
    "environment",
    "outcome",
    "schemaVersion",
    "type",
  ]);
  assert.equal(recordAuthenticationEvent(auditEvent, () => { throw new Error("sink"); }), false);
  console.log("IDENTITY_LINK_SERVER_BEHAVIOR_OK");
}

if (process.argv.includes("--deployed")) {
  await verifyDeployedProviderParsing();
} else {
  await verifyLocalServerBehavior();
}
