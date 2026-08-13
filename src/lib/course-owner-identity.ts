export interface CourseOwnerIdentity {
  uid: string;
  isOwner: boolean;
}

export function courseAuthorIdsForAccount(
  account: CourseOwnerIdentity,
  migratedOwnerUid = process.env.MIGRATED_OWNER_UID,
) {
  const authorIds = new Set([account.uid.trim()]);
  const migratedUid = migratedOwnerUid?.trim();
  if (account.isOwner && migratedUid && migratedUid.length <= 128) {
    authorIds.add(migratedUid);
  }
  return [...authorIds].filter(Boolean);
}
