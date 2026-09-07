import { assertLearnerSession, withLearnerDeadline } from "@/lib/learner-source";
import { activeLearnerUid, clearLearnerAccountStorage, learnerRequest, learnerSessionSnapshot, type LearnerStorageUser } from "@/lib/learner-storage";

export async function downloadLearnerFile(user: LearnerStorageUser, path: string, filename: string) {
  const session = learnerSessionSnapshot(user.uid);
  const blob = await withLearnerDeadline(session.signal, async (signal) => {
    const response = await learnerRequest(user, path, { cache: "no-store", signal });
    if (!response.ok) throw new Error("Your export could not be prepared. Try again.");
    return response.blob();
  });
  assertLearnerSession(session);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename;
    document.body.appendChild(anchor);
    try { assertLearnerSession(session); anchor.click(); }
    finally { anchor.remove(); }
  } finally { URL.revokeObjectURL(url); }
}

export async function copyLearnerText(session: ReturnType<typeof learnerSessionSnapshot>, text: string) {
  assertLearnerSession(session);
  // The browser clipboard call cannot be cancelled once dispatched. Recheck
  // after completion so it cannot mark a later account's UI as copied.
  await navigator.clipboard.writeText(text);
  assertLearnerSession(session);
}

let deletionReceipt: { epoch: number; message: string } | null = null;
const receiptListeners = new Set<() => void>();
export const subscribeDeletionReceipt = (listener: () => void) => {
  receiptListeners.add(listener); return () => { receiptListeners.delete(listener); };
};
export function readDeletionReceipt() {
  return activeLearnerUid() === null && deletionReceipt?.epoch === learnerSessionSnapshot().revision ? deletionReceipt.message : null;
}
export function acknowledgeActiveDataRemoval(user: LearnerStorageUser) {
  const session = learnerSessionSnapshot(user.uid);
  assertLearnerSession(session);
  // Generic tab memory only: no account, job reference, response or private data.
  // Save before invalidation remounts the auth subtree; any later identity epoch
  // makes this receipt inaccessible, including B signing in then signing out.
  deletionReceipt = { epoch: session.revision + 1, message: "Your active learning data has been removed. Retention and identity review remain pending." };
  clearLearnerAccountStorage(user.uid);
  receiptListeners.forEach((listener) => listener());
}
