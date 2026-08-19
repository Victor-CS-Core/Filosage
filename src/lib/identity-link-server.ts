import "server-only";

import { recordAuthenticationEvent } from "@/lib/auth-audit";
import {
  getStoredDocument,
  runStoredDocumentTransaction,
  type StoredDocument,
} from "@/lib/firebase-server";
import {
  assertFreshDirectGoogleLinkAuthentication,
  assertFreshExternalLinkAuthentication,
  type BackfillAccountInput,
  canonicalIdentityFromRegistry,
  completeIdentityLinkTransactionPlan,
  createIdentityLinkTransactionPlan,
  IDENTITY_LINK_INTENT_TTL_MS,
  identityOnboardingStateFromRegistry,
  linkIntentPath,
  LinkIntentError,
  opaqueIdentityKey,
  planIdentityBackfill as planIdentityBackfillWithSecret,
  prepareIdentityRegistration as prepareIdentityRegistrationWithSecret,
  identityRegistryKeys as identityRegistryKeysWithSecret,
  REGISTRY_KEY_VERSION,
  validateLinkCompletion,
} from "@/lib/identity-link-policy";
import type { VerifiedProviderIdentity, VerifiedUser } from "@/lib/identity-types";
import { isLocalMode } from "@/lib/local-mode";
import { serverEnvironment } from "@/lib/runtime-environment";

export {
  ExternalIdSignupUnavailableError,
  IdentityLinkRequiredError,
  IdentityRegistryConflictError,
  LinkIntentError,
  identityIntentPathsToPrune,
  identityRegistrationWrites,
} from "@/lib/identity-link-policy";
export type { IdentityOnboardingState } from "@/lib/identity-link-policy";

function requiredHmacSecret(explicit?: string) {
  const secret = explicit?.trim()
    || serverEnvironment.IDENTITY_LINK_HMAC_SECRET?.trim()
    || (isLocalMode() ? "filosage-local-identity-link-secret-v1" : "");
  if (secret.length < 32) {
    throw new Error("IDENTITY_LINK_HMAC_SECRET must contain at least 32 characters.");
  }
  return secret;
}

function configuredOpaqueIdentityKey(scope: string, value: string, explicit?: string) {
  return opaqueIdentityKey(scope, value, requiredHmacSecret(explicit));
}

export function configuredOpaqueProviderIdentityKey(
  scope: string,
  identity: VerifiedProviderIdentity,
  explicit?: string,
) {
  return configuredOpaqueIdentityKey(
    scope,
    JSON.stringify([identity.provider, identity.issuer, identity.subject]),
    explicit,
  );
}

function configuredLinkIntentPath(token: string, explicit?: string) {
  return linkIntentPath(token, requiredHmacSecret(explicit));
}

type TransactionUpdate<T> = (
  documents: Record<string, StoredDocument | null>,
) => { writes: Array<{ path: string; data: Record<string, unknown> }>; result: T };

export interface IdentityLinkDependencies {
  secret?: string;
  getDocument?: typeof getStoredDocument;
  runTransaction?: <T>(paths: string[], update: TransactionUpdate<T>) => Promise<T>;
  recordEvent?: typeof recordAuthenticationEvent;
}

function dependencies(overrides: IdentityLinkDependencies | undefined) {
  if (overrides && !isLocalMode()) {
    throw new Error("Identity-link test dependencies are unavailable outside local mode.");
  }
  return {
    secret: overrides?.secret,
    getDocument: overrides?.getDocument ?? getStoredDocument,
    runTransaction: overrides?.runTransaction ?? runStoredDocumentTransaction,
    recordEvent: overrides?.recordEvent ?? recordAuthenticationEvent,
  };
}

function randomLinkToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

function bestEffortAuthenticationEvent(
  recordEvent: typeof recordAuthenticationEvent,
  event: Parameters<typeof recordAuthenticationEvent>[0],
) {
  try {
    recordEvent(event);
  } catch {
    // Audit transport failure must not roll back or misreport an auth transaction.
  }
}

export function configuredIdentityRegistryKeys(
  identity: VerifiedProviderIdentity,
  explicit?: string,
) {
  return identityRegistryKeysWithSecret(identity, requiredHmacSecret(explicit));
}

export function preparedIdentityRegistration(user: VerifiedUser, explicit?: string) {
  return prepareIdentityRegistrationWithSecret(user, requiredHmacSecret(explicit));
}

export function planIdentityBackfill(
  accounts: BackfillAccountInput[],
  existing: Record<string, Record<string, unknown> | null>,
  explicit?: string,
  now = new Date().toISOString(),
) {
  return planIdentityBackfillWithSecret(
    accounts,
    existing,
    requiredHmacSecret(explicit),
    now,
  );
}

export async function resolveCanonicalIdentity(identity: VerifiedProviderIdentity) {
  if (identity.provider === "local") {
    return canonicalIdentityFromRegistry(identity, null, null, false);
  }
  const keys = await configuredIdentityRegistryKeys(identity);
  const link = await getStoredDocument(keys.identityPath);
  const subjectAccount = link === null && identity.provider === "filosage"
    ? await getStoredDocument(`users/${identity.subject}`)
    : null;
  return canonicalIdentityFromRegistry(identity, keys, link, subjectAccount !== null);
}

export async function identityOnboardingState(user: VerifiedUser) {
  const keys = await configuredIdentityRegistryKeys(user.providerIdentity);
  const [account, emailOwner] = await Promise.all([
    getStoredDocument(`users/${user.uid}`),
    getStoredDocument(keys.emailPath),
  ]);
  return identityOnboardingStateFromRegistry(user, keys, account, emailOwner);
}

export async function createIdentityLinkIntent(
  user: VerifiedUser,
  returnPath: string,
  options: {
    now?: number;
    token?: string;
    dependencies?: IdentityLinkDependencies;
  } = {},
) {
  const now = options.now ?? Date.now();
  assertFreshDirectGoogleLinkAuthentication(user, now);
  const adapter = dependencies(options.dependencies);
  const token = options.token ?? randomLinkToken();
  const [intentPath, keys] = await Promise.all([
    configuredLinkIntentPath(token, adapter.secret),
    configuredIdentityRegistryKeys(user.providerIdentity, adapter.secret),
  ]);
  const expiresAt = new Date(now + IDENTITY_LINK_INTENT_TTL_MS).toISOString();
  const accountPath = `users/${user.uid}`;
  await adapter.runTransaction(
    [intentPath, keys.identityPath, keys.emailPath, accountPath],
    (documents) => createIdentityLinkTransactionPlan(documents, {
      intentPath,
      keys,
      user,
      returnPath,
      now,
    }),
  );
  const correlationId = crypto.randomUUID();
  bestEffortAuthenticationEvent(adapter.recordEvent, {
    code: "account.identity_link_started",
    outcome: "allowed",
    correlationId,
    actorKey: await configuredOpaqueIdentityKey("actor", user.uid, adapter.secret),
  });
  return { token, expiresAt, correlationId };
}

export async function completeIdentityLinkIntent(
  token: string,
  identity: VerifiedProviderIdentity,
  options: {
    now?: number;
    dependencies?: IdentityLinkDependencies;
  } = {},
) {
  const now = options.now ?? Date.now();
  assertFreshExternalLinkAuthentication(identity, now);
  const adapter = dependencies(options.dependencies);
  const [intentPath, keys] = await Promise.all([
    configuredLinkIntentPath(token, adapter.secret),
    configuredIdentityRegistryKeys(identity, adapter.secret),
  ]);

  // The transaction adapter needs all read paths up front. This read discovers
  // only the candidate account path; the complete intent and account are read
  // and validated again inside the transaction before any write is returned.
  const candidateIntent = await adapter.getDocument(intentPath);
  if (!candidateIntent) throw new LinkIntentError("invalid");
  const candidate = validateLinkCompletion(candidateIntent, keys.emailHash, now, { intentPath });
  const sourceIdentityHash = String(candidateIntent.sourceIdentityHash);
  const sourceIdentityPath = `identityLinks/${REGISTRY_KEY_VERSION}_${sourceIdentityHash}`;
  const accountPath = `users/${candidate.canonicalUid}`;

  const result = await adapter.runTransaction(
    [intentPath, sourceIdentityPath, keys.identityPath, keys.emailPath, accountPath],
    (documents) => completeIdentityLinkTransactionPlan(documents, {
      intentPath,
      sourceIdentityPath,
      keys,
      identity,
      candidateCanonicalUid: candidate.canonicalUid,
      sourceIdentityHash,
      now,
    }),
  );
  const correlationId = crypto.randomUUID();
  bestEffortAuthenticationEvent(adapter.recordEvent, {
    code: "account.identity_link_succeeded",
    outcome: "allowed",
    correlationId,
    actorKey: await configuredOpaqueIdentityKey("actor", result.canonicalUid, adapter.secret),
  });
  return { ...result, correlationId };
}
