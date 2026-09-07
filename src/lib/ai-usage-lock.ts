type Document = Record<string, unknown>;
type Lock = { activeRequestId?: unknown; activeAttemptToken?: unknown; activeUntil?: unknown };
function locks(period: Document | null | undefined): Record<string, Lock> {
  return period?.resourceLocks && typeof period.resourceLocks === "object" && !Array.isArray(period.resourceLocks)
    ? period.resourceLocks as Record<string, Lock> : {};
}
export function aiUsageLock(period: Document | null | undefined, key?: string): Lock {
  return key ? locks(period)[key] ?? {} : period ?? {};
}
export function aiUsageLockWrite(period: Document | null | undefined, key: string | undefined, requestId: string, token: string, until: string) {
  const value = { activeRequestId: requestId, activeAttemptToken: token, activeUntil: until };
  // Drop only expired locks; original attempts retain their own accounting.
  const active = Object.fromEntries(Object.entries(locks(period)).filter(([, lock]) => Date.parse(String(lock.activeUntil)) > Date.now()));
  return key ? { resourceLocks: { ...active, [key]: value } } : value;
}
export function aiUsageReleaseLock(period: Document | null | undefined, key: string | undefined, requestId: string, token: string | undefined): Document {
  const lock = aiUsageLock(period, key);
  if (lock.activeRequestId !== requestId || lock.activeAttemptToken !== token) return {};
  if (!key) return { activeRequestId: null, activeAttemptToken: null, activeUntil: null };
  const next = { ...locks(period) }; delete next[key];
  return { resourceLocks: next };
}
export function aiUsageConflictingUntil(period: Document | null | undefined, key?: string) {
  const own = Date.parse(String(aiUsageLock(period, key).activeUntil)) || 0;
  const legacy = Date.parse(String(period?.activeUntil)) || 0;
  return key ? Math.max(own, legacy)
    : Math.max(own, ...Object.values(locks(period)).map((lock) => Date.parse(String(lock.activeUntil)) || 0));
}
