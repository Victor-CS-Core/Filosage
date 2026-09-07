import { EMPTY_LEARNER_STATE, readLearnerState, type LearnerState } from "@/lib/learner-state";
import { assertLearnerSession, learnerJson } from "@/lib/learner-source";
import { learnerSessionSnapshot, subscribeLearnerSession, readLearnerStorage, writeLearnerStorage, type LearnerStorageUser } from "@/lib/learner-storage";

type NoteChange = { key: string; content: string; updatedAt: string };
type Preferences = Omit<LearnerState, "notes" | "noteUpdatedAt">;
interface PendingSync { preferences?: Preferences; notes: Record<string, NoteChange>; deleted: Record<string, string> }
const pendingMemory = new Map<number, PendingSync>();
const mutationRevisions = new Map<number, number>();
subscribeLearnerSession(() => { pendingMemory.clear(); mutationRevisions.clear(); });
const emptyPending = (): PendingSync => ({ notes: {}, deleted: {} });
export function pendingLearnerSync(uid: string): PendingSync {
  const session = learnerSessionSnapshot(uid);
  assertLearnerSession(session);
  return pendingMemory.get(session.revision) ?? readLearnerStorage<PendingSync>(uid, "learner-sync") ?? emptyPending();
}
export function hasPendingLearnerSync(uid: string) {
  const pending = pendingLearnerSync(uid);
  return Boolean(pending.preferences || Object.keys(pending.notes).length || Object.keys(pending.deleted).length);
}
function preferences(state: LearnerState): Preferences {
  return { courseBookmarks: state.courseBookmarks, lessonBookmarks: state.lessonBookmarks, weeklyLessonGoal: state.weeklyLessonGoal, dashboardPreferences: state.dashboardPreferences, reminderPreferences: state.reminderPreferences, updatedAt: state.updatedAt };
}
export function queueLearnerStateChanges(uid: string, previous: LearnerState, next: LearnerState) {
  const pending = pendingLearnerSync(uid);
  const revision = learnerSessionSnapshot(uid).revision;
  mutationRevisions.set(revision, (mutationRevisions.get(revision) ?? 0) + 1);
  pending.preferences = preferences(next);
  for (const key of new Set([...Object.keys(previous.notes), ...Object.keys(next.notes)])) {
    if (previous.notes[key] === next.notes[key] && previous.noteUpdatedAt[key] === next.noteUpdatedAt[key]) continue;
    if (!(key in next.notes) || !next.notes[key].trim()) {
      pending.deleted[key] = next.updatedAt ?? new Date().toISOString();
      delete pending.notes[key];
    } else {
      pending.notes[key] = { key, content: next.notes[key], updatedAt: next.noteUpdatedAt[key] ?? next.updatedAt ?? new Date().toISOString() };
      delete pending.deleted[key];
    }
  }
  pendingMemory.set(learnerSessionSnapshot(uid).revision, pending);
  return writeLearnerStorage(uid, "learner-sync", "all", pending);
}
// Pending tombstones can be acknowledged while an older GET is still in flight.
// Fence the entire read against mutations, independently of that pending queue.
export function beginLearnerStateRead(uid: string) {
  const session = learnerSessionSnapshot(uid);
  assertLearnerSession(session);
  const revision = mutationRevisions.get(session.revision) ?? 0;
  return (cloud: LearnerState) => {
    assertLearnerSession(session);
    if ((mutationRevisions.get(session.revision) ?? 0) !== revision) {
      throw new Error("Your learning data changed while loading. Your latest device copy is preserved; retry account sync.");
    }
    return mergeLearnerCloud(uid, cloud);
  };
}
export function mergeLearnerCloud(uid: string, cloud: LearnerState): LearnerState {
  const local = readLearnerState(uid);
  const pending = pendingLearnerSync(uid);
  const notes = { ...cloud.notes };
  const noteUpdatedAt = { ...cloud.noteUpdatedAt };
  for (const key of Object.keys(local.notes)) {
    if (pending.notes[key] || !(key in notes) || (Date.parse(local.noteUpdatedAt[key] ?? "") || 0) >= (Date.parse(noteUpdatedAt[key] ?? "") || 0)) {
      notes[key] = local.notes[key];
      if (local.noteUpdatedAt[key]) noteUpdatedAt[key] = local.noteUpdatedAt[key];
    }
  }
  for (const key of Object.keys(pending.deleted)) { delete notes[key]; delete noteUpdatedAt[key]; }
  const settings = pending.preferences ?? ((Date.parse(local.updatedAt ?? "") || 0) > (Date.parse(cloud.updatedAt ?? "") || 0) ? preferences(local) : preferences(cloud));
  return { ...EMPTY_LEARNER_STATE, ...settings, notes, noteUpdatedAt };
}
const queues = new Map<number, Promise<void>>();
export function syncLearnerState(user: LearnerStorageUser): Promise<void> {
  const session = learnerSessionSnapshot(user.uid);
  const previous = queues.get(session.revision) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    assertLearnerSession(session);
    while (hasPendingLearnerSync(user.uid)) {
      assertLearnerSession(session);
      const sent = structuredClone(pendingLearnerSync(user.uid));
      const noteChanges = Object.values(sent.notes).slice(0, 50);
      const deletedNoteKeys = Object.keys(sent.deleted).slice(0, 50);
      await learnerJson(user, "/api/learner-state", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: sent.preferences ?? preferences(readLearnerState(user.uid)), noteChanges, deletedNoteKeys }),
      });
      assertLearnerSession(session);
      // Acknowledgement must not discard a newer edit queued while IO was pending.
      const remaining = pendingLearnerSync(user.uid);
      if (JSON.stringify(remaining.preferences) === JSON.stringify(sent.preferences)) delete remaining.preferences;
      for (const note of noteChanges) if (JSON.stringify(remaining.notes[note.key]) === JSON.stringify(note)) delete remaining.notes[note.key];
      for (const key of deletedNoteKeys) if (remaining.deleted[key] === sent.deleted[key]) delete remaining.deleted[key];
      pendingMemory.set(session.revision, remaining);
      if (!writeLearnerStorage(user.uid, "learner-sync", "all", remaining)) throw new Error("This browser could not record the sync result. Keep this page open and try again.");
    }
  });
  queues.set(session.revision, operation);
  void operation.finally(() => { if (queues.get(session.revision) === operation) queues.delete(session.revision); }).catch(() => undefined);
  return operation;
}
