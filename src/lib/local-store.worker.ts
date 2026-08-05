import "server-only";

/**
 * Worker builds cannot access the file-backed development store. Production is
 * already hard-gated away from local mode; this replacement keeps Node's file
 * system modules out of the Worker bundle and fails loudly if that invariant
 * is ever broken.
 */
export async function localFirestoreJson<T>(
  _path: string,
  _init: RequestInit = {},
  _allowNotFound = false,
): Promise<T | null> {
  void _path;
  void _init;
  void _allowNotFound;
  throw new Error("The local Firestore store is unavailable in production.");
}
