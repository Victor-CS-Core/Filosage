import {
  DIRECT_GOOGLE_ISSUER,
  type VerifiedProviderIdentity,
  type VerifiedUser,
} from "@/lib/identity-types";

export const REGISTRY_KEY_VERSION = "v1" as const;

export class IdentityLinkRequiredError extends Error {
  readonly code = "identity_link_required";

  constructor() {
    super("This email is already connected to a Filosage learning account. Confirm your existing sign-in to connect the new method.");
  }
}

export class IdentityRegistryConflictError extends Error {
  readonly code = "identity_registry_conflict";

  constructor() {
    super("The identity registry is inconsistent; no account data was changed.");
  }
}

export class ExternalIdSignupUnavailableError extends Error {
  readonly code = "external_id_signup_unavailable";

  constructor() {
    super("Email-code sign-up is not available yet. You can continue with Google.");
  }
}

export function normalizedVerifiedEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function requiredExplicitHmacSecret(value: string) {
  const secret = value.trim();
  if (secret.length < 32) {
    throw new Error("IDENTITY_LINK_HMAC_SECRET must contain at least 32 characters.");
  }
  return secret;
}

export async function hmacHex(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredExplicitHmacSecret(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  ));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface IdentityRegistryKeys {
  identityHash: string;
  emailHash: string;
  identityPath: string;
  emailPath: string;
}

export interface PreparedIdentityRegistration extends IdentityRegistryKeys {
  canonicalUid: string;
  provider: VerifiedProviderIdentity["provider"];
}

export type IdentityRegistryDocument = Record<string, unknown> | null;

function canonicalUser(
  identity: VerifiedProviderIdentity,
  uid: string,
  identityLinkRegistered: boolean,
): VerifiedUser {
  return {
    uid,
    email: identity.email,
    email_verified: true,
    auth_time: identity.authTime,
    name: identity.name,
    picture: identity.picture,
    providerIdentity: identity,
    identityLinkRegistered,
  };
}

export function canonicalIdentityFromRegistry(
  identity: VerifiedProviderIdentity,
  keys: IdentityRegistryKeys | null,
  link: IdentityRegistryDocument,
  subjectAccountExists: boolean,
) {
  if (identity.provider === "local") return canonicalUser(identity, identity.subject, true);
  if (!keys) throw new IdentityRegistryConflictError();
  if (link === null && identity.provider === "filosage" && subjectAccountExists) {
    throw new IdentityRegistryConflictError();
  }
  if (link === null) return canonicalUser(identity, identity.subject, false);
  const canonicalUid = typeof link?.canonicalUid === "string" ? link.canonicalUid : "";
  if (
    !canonicalUid.trim()
    || canonicalUid !== canonicalUid.trim()
    || link.keyVersion !== REGISTRY_KEY_VERSION
    || link.identityHash !== keys.identityHash
  ) {
    throw new IdentityRegistryConflictError();
  }
  return canonicalUser(identity, canonicalUid, true);
}

export type IdentityOnboardingState = "ready" | "new_account" | "identity_link_required";

export function identityOnboardingStateFromRegistry(
  user: VerifiedUser,
  keys: IdentityRegistryKeys,
  account: IdentityRegistryDocument,
  emailOwner: IdentityRegistryDocument,
): IdentityOnboardingState {
  const ownerUid = typeof emailOwner?.canonicalUid === "string" ? emailOwner.canonicalUid : "";
  if (emailOwner !== null && (
    !ownerUid.trim()
    || ownerUid !== ownerUid.trim()
    || emailOwner.keyVersion !== REGISTRY_KEY_VERSION
    || emailOwner.emailHash !== keys.emailHash
  )) {
    throw new IdentityRegistryConflictError();
  }
  if (account !== null) {
    if (ownerUid && ownerUid !== user.uid) throw new IdentityRegistryConflictError();
    return "ready";
  }
  if (ownerUid && ownerUid !== user.uid) return "identity_link_required";
  return "new_account";
}

export async function identityRegistryKeys(identity: VerifiedProviderIdentity, secret: string) {
  const email = normalizedVerifiedEmail(identity.email);
  if (!email || !identity.emailVerified || !identity.subject || !identity.issuer) {
    throw new IdentityRegistryConflictError();
  }
  const [identityHash, emailHash] = await Promise.all([
    hmacHex(JSON.stringify([
      REGISTRY_KEY_VERSION,
      identity.provider,
      identity.issuer,
      identity.subject,
    ]), secret),
    hmacHex(JSON.stringify([REGISTRY_KEY_VERSION, email]), secret),
  ]);
  return {
    identityHash,
    emailHash,
    identityPath: `identityLinks/${REGISTRY_KEY_VERSION}_${identityHash}`,
    emailPath: `identityEmailOwners/${REGISTRY_KEY_VERSION}_${emailHash}`,
  } satisfies IdentityRegistryKeys;
}

export async function prepareIdentityRegistration(user: VerifiedUser, secret: string) {
  const keys = await identityRegistryKeys(user.providerIdentity, secret);
  return {
    ...keys,
    canonicalUid: user.uid,
    provider: user.providerIdentity.provider,
  } satisfies PreparedIdentityRegistration;
}

export function identityRegistrationWrites(
  documents: Record<string, IdentityRegistryDocument>,
  registration: PreparedIdentityRegistration,
  now: string,
  options: { allowNewExternalAccounts: boolean },
) {
  const link = documents[registration.identityPath] ?? null;
  const emailOwner = documents[registration.emailPath] ?? null;
  const linkedUid = typeof link?.canonicalUid === "string" ? link.canonicalUid : "";
  const ownerUid = typeof emailOwner?.canonicalUid === "string" ? emailOwner.canonicalUid : "";

  if (link !== null && (
    !linkedUid.trim()
    || linkedUid !== linkedUid.trim()
    || linkedUid !== registration.canonicalUid
    || link.keyVersion !== REGISTRY_KEY_VERSION
    || link.identityHash !== registration.identityHash
  )) {
    throw new IdentityRegistryConflictError();
  }
  if (emailOwner !== null && (
    !ownerUid.trim()
    || ownerUid !== ownerUid.trim()
    || emailOwner.keyVersion !== REGISTRY_KEY_VERSION
    || emailOwner.emailHash !== registration.emailHash
  )) {
    throw new IdentityRegistryConflictError();
  }
  if (ownerUid && ownerUid !== registration.canonicalUid) {
    throw new IdentityLinkRequiredError();
  }

  const account = documents[`users/${registration.canonicalUid}`] ?? null;
  if (registration.provider === "filosage" && link === null && account !== null) {
    throw new IdentityRegistryConflictError();
  }
  if (
    registration.provider === "filosage"
    && link === null
    && !options.allowNewExternalAccounts
  ) {
    throw new ExternalIdSignupUnavailableError();
  }

  return [
    ...(link === null ? [{
      path: registration.identityPath,
      data: {
        schemaVersion: 1,
        keyVersion: REGISTRY_KEY_VERSION,
        identityHash: registration.identityHash,
        canonicalUid: registration.canonicalUid,
        provider: registration.provider,
        createdAt: now,
        updatedAt: now,
      },
    }] : []),
    ...(emailOwner === null ? [{
      path: registration.emailPath,
      data: {
        schemaVersion: 1,
        keyVersion: REGISTRY_KEY_VERSION,
        emailHash: registration.emailHash,
        canonicalUid: registration.canonicalUid,
        createdAt: now,
        updatedAt: now,
      },
    }] : []),
  ];
}

export interface BackfillAccountInput {
  uid: string;
  email: string;
}

export interface RegistryWrite {
  path: string;
  data: Record<string, unknown>;
}

function exactRegistryRecord(
  value: Record<string, unknown> | null | undefined,
  expected: Record<string, unknown>,
) {
  return Object.entries(expected).every(([key, item]) => value?.[key] === item);
}

export async function planIdentityBackfill(
  accounts: BackfillAccountInput[],
  existing: Record<string, Record<string, unknown> | null>,
  secret: string,
  now = new Date().toISOString(),
) {
  const errors: string[] = [];
  const candidates: Array<{
    account: BackfillAccountInput;
    registration: PreparedIdentityRegistration;
  }> = [];
  const emailOwners = new Map<string, string>();
  let invalid = 0;
  let duplicateEmails = 0;
  let conflicts = 0;
  let exact = 0;

  for (const account of accounts) {
    const email = normalizedVerifiedEmail(account.email);
    if (!account.uid.trim() || !email) {
      invalid += 1;
      continue;
    }
    const priorUid = emailOwners.get(email);
    if (priorUid && priorUid !== account.uid) {
      duplicateEmails += 1;
      errors.push("Two existing accounts share one normalized verified email.");
      continue;
    }
    emailOwners.set(email, account.uid);
    const providerIdentity: VerifiedProviderIdentity = {
      provider: "google",
      issuer: DIRECT_GOOGLE_ISSUER,
      subject: account.uid,
      email,
      emailVerified: true,
    };
    const user: VerifiedUser = {
      uid: account.uid,
      email,
      email_verified: true,
      providerIdentity,
      identityLinkRegistered: false,
    };
    candidates.push({
      account: { uid: account.uid, email },
      registration: await prepareIdentityRegistration(user, secret),
    });
  }

  const writes: RegistryWrite[] = [];
  for (const { registration } of candidates) {
    const expected = identityRegistrationWrites(
      {},
      registration,
      now,
      { allowNewExternalAccounts: false },
    );
    for (const write of expected) {
      const found = existing[write.path];
      const stableExpected = Object.fromEntries(
        Object.entries(write.data).filter(([key]) => ![
          "createdAt",
          "updatedAt",
        ].includes(key)),
      );
      if (!found) {
        writes.push(write);
      } else if (exactRegistryRecord(found, stableExpected)) {
        exact += 1;
      } else {
        conflicts += 1;
        errors.push(
          "An existing identity registry record conflicts with the expected canonical UID.",
        );
      }
    }
  }

  if (duplicateEmails || conflicts) writes.length = 0;
  return {
    candidates,
    writes,
    errors,
    counts: {
      accounts: accounts.length,
      missing: writes.length,
      exact,
      invalid,
      duplicateEmails,
      conflicts,
    },
  };
}

export const IDENTITY_LINK_INTENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function identityIntentPathsToPrune(
  records: Array<{ id: string; expiresAt?: unknown; usedAt?: unknown }>,
  now = Date.now(),
) {
  const cutoff = now - IDENTITY_LINK_INTENT_RETENTION_MS;
  return records.flatMap((record) => {
    const terminal = typeof record.usedAt === "string"
      ? Date.parse(record.usedAt)
      : typeof record.expiresAt === "string"
        ? Date.parse(record.expiresAt)
        : Number.NaN;
    return Number.isFinite(terminal) && terminal <= cutoff
      ? [`identityLinkIntents/${record.id}`]
      : [];
  });
}
