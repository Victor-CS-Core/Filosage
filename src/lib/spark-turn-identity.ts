import { readLearnerStorage, removeLearnerStorage, writeLearnerStorage, type LearnerStorageUser } from "@/lib/learner-storage";

type TurnIdentity = { id: string; fingerprint: string; resourceId: string };

/** Persist only a digest and request ID, never a learner's question or answer. */
export async function savedSparkTurnIdentity(user: LearnerStorageUser, sessionId: string, lessonVersion: string, action: string, message: string): Promise<TurnIdentity> {
  const bytes = new TextEncoder().encode(JSON.stringify([sessionId, lessonVersion, action, message]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const resourceId = `spark-turn:${user.accountGeneration ?? "legacy"}:${sessionId}:${lessonVersion}:${fingerprint}`;
  const saved = readLearnerStorage<{ id?: unknown; fingerprint?: unknown }>(user.uid, "generation-operation", resourceId);
  if (saved) {
    if (typeof saved.id !== "string" || !/^[a-f0-9-]{36}$/i.test(saved.id) || saved.fingerprint !== fingerprint) throw new Error("The saved Spark request needs recovery before another turn can start.");
    return { id: saved.id, fingerprint, resourceId };
  }
  const id = crypto.randomUUID();
  if (!writeLearnerStorage(user.uid, "generation-operation", resourceId, { id, fingerprint })) throw new Error("This browser could not save the Spark request identity. Enable browser storage before trying again.");
  return { id, fingerprint, resourceId };
}

export function clearSavedSparkTurnIdentity(user: LearnerStorageUser, identity: TurnIdentity) {
  const saved = readLearnerStorage<{ id?: unknown }>(user.uid, "generation-operation", identity.resourceId);
  if (saved?.id === identity.id) removeLearnerStorage(user.uid, "generation-operation", identity.resourceId);
}
