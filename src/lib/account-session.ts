// This is a concurrency claim, not authentication proof. The server first
// verifies the platform identity, then requires any supplied claim to match it.
export const EXPECTED_ACCOUNT_HEADER = "x-filosage-expected-uid";
const LEGACY_SESSION_MARKER = "azure-easy-auth-session";
const ACCOUNT_SESSION_PREFIX = `${LEGACY_SESSION_MARKER}.v1:`;

function canonicalUid(value: string) {
  return value.length > 0 && value.length <= 512 && value === value.trim() && !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

export function accountSessionMarker(uid: string) {
  if (!canonicalUid(uid)) throw new Error("A canonical account ID is required for learning requests.");
  return `${ACCOUNT_SESSION_PREFIX}${encodeURIComponent(uid)}`;
}

function decodeClaim(value: string) {
  try {
    const uid = decodeURIComponent(value);
    return canonicalUid(uid) && encodeURIComponent(uid) === value ? uid : null;
  } catch { return null; }
}

export function requestAccountMatchesVerifiedUid(headers: Headers, verifiedUid: string) {
  const header = headers.get(EXPECTED_ACCOUNT_HEADER);
  if (header !== null && decodeClaim(header) !== verifiedUid) return false;
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer?.startsWith(LEGACY_SESSION_MARKER) && bearer !== LEGACY_SESSION_MARKER) {
    if (!bearer.startsWith(ACCOUNT_SESSION_PREFIX)) return false;
    if (decodeClaim(bearer.slice(ACCOUNT_SESSION_PREFIX.length)) !== verifiedUid) return false;
  }
  // Older clients without a claim keep their established auth behavior. New
  // clients always include the UID; claims cannot create or select an identity.
  return true;
}
