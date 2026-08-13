import "server-only";

import type { ServerAccount } from "@/lib/account-server";
import { listOwnerCourses, runStoredDocumentTransaction } from "@/lib/firebase-server";
import { MEMBERSHIP_PLANS, planAllows, type PlanCapability } from "@/lib/membership-plans";
import { courseAuthorIdsForAccount } from "@/lib/course-owner-identity";

export class CourseCapacityError extends Error {
  readonly status = 409;
  readonly code = "COURSE_CAPACITY_REACHED";

  constructor(public readonly limit: number, public readonly owned: number) {
    super(`Your plan supports ${limit} active private ${limit === 1 ? "course" : "courses"}. Delete a course or upgrade before creating another.`);
  }
}

export function capabilitiesForAccount(account: Pick<ServerAccount, "plan" | "isOwner" | "accountStatus">) {
  const active = account.accountStatus !== "suspended";
  const allowed = (capability: PlanCapability) => active && (account.isOwner || planAllows(account.plan, capability));
  return {
    createCourse: allowed("create_course"),
    generateLesson: allowed("generate_lesson"),
    generateCourseBanner: allowed("generate_course_banner"),
    publishCourse: allowed("publish_course"),
  };
}

export async function courseCapacityForAccount(account: Pick<ServerAccount, "uid" | "plan" | "isOwner">) {
  const owned = (await Promise.all(
    courseAuthorIdsForAccount(account).map((authorId) => listOwnerCourses(authorId)),
  )).flat().length;
  const limit = account.isOwner ? null : MEMBERSHIP_PLANS[account.plan].limits.activeOwnedCourses;
  return {
    owned,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - owned),
    overLimit: limit !== null && owned > limit,
  };
}

export interface CourseCapacityReservation {
  uid: string;
  requestId: string;
  capacityPath: string;
  claimPath: string;
  acquired: boolean;
}

const COURSE_CAPACITY_LEASE_MS = 15 * 60_000;

export async function courseCapacityClaimId(uid: string, idempotencyKey: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${uid}:course-capacity:${idempotencyKey}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function reserveCourseCapacity(account: ServerAccount, requestId: string): Promise<CourseCapacityReservation | null> {
  const limit = account.isOwner ? null : MEMBERSHIP_PLANS[account.plan].limits.activeOwnedCourses;
  if (limit === null) return null;

  const observedOwned = (await listOwnerCourses(account.uid)).length;
  const capacityPath = `users/${account.uid}/courseCapacity/current`;
  const claimPath = `users/${account.uid}/courseCapacityClaims/${requestId}`;
  const now = new Date().toISOString();

  const acquired = await runStoredDocumentTransaction([capacityPath, claimPath], (documents) => {
    const capacity = documents[capacityPath];
    const claim = documents[claimPath];
    if (claim?.status === "completed") return { writes: [], result: false };

    const reservationRequestId = typeof capacity?.reservationRequestId === "string"
      ? capacity.reservationRequestId
      : undefined;
    const reservationExpiresAt = typeof capacity?.reservationExpiresAt === "string"
      ? Date.parse(capacity.reservationExpiresAt)
      : 0;
    const reservationActive = Boolean(reservationRequestId) && reservationExpiresAt > Date.now();
    if (claim?.status === "reserved" && reservationActive && reservationRequestId === requestId) {
      return { writes: [], result: false };
    }

    const storedOwned = typeof capacity?.owned === "number" ? capacity.owned : 0;
    const effectiveOwned = reservationActive ? Math.max(storedOwned, observedOwned) : observedOwned;
    if (effectiveOwned >= limit) throw new CourseCapacityError(limit, effectiveOwned);

    return {
      writes: [
        {
          path: capacityPath,
          data: {
            uid: account.uid,
            owned: effectiveOwned + 1,
            observedOwned,
            plan: account.plan,
            reservationRequestId: requestId,
            reservationExpiresAt: new Date(Date.now() + COURSE_CAPACITY_LEASE_MS).toISOString(),
            updatedAt: now,
          },
        },
        { path: claimPath, data: { uid: account.uid, requestId, status: "reserved", createdAt: claim?.createdAt ?? now, updatedAt: now } },
      ],
      result: true,
    };
  });

  return { uid: account.uid, requestId, capacityPath, claimPath, acquired };
}

export async function completeCourseCapacityReservation(reservation: CourseCapacityReservation | null, courseId: string) {
  if (!reservation) return;
  await runStoredDocumentTransaction([reservation.capacityPath, reservation.claimPath], (documents) => {
    const capacity = documents[reservation.capacityPath];
    const claim = documents[reservation.claimPath];
    if (!claim || claim.status === "completed") return { writes: [], result: undefined };
    const now = new Date().toISOString();
    const writes: Array<{ path: string; data: Record<string, unknown> }> = [
      { path: reservation.claimPath, data: { ...claim, status: "completed", courseId, updatedAt: now } },
    ];
    if (capacity?.reservationRequestId === reservation.requestId) {
      writes.push({
        path: reservation.capacityPath,
        data: { ...capacity, reservationRequestId: null, reservationExpiresAt: null, updatedAt: now },
      });
    }
    return {
      writes,
      result: undefined,
    };
  });
}

export async function releaseCourseCapacityReservation(reservation: CourseCapacityReservation | null) {
  if (!reservation?.acquired) return;
  await runStoredDocumentTransaction([reservation.capacityPath, reservation.claimPath], (documents) => {
    const capacity = documents[reservation.capacityPath];
    const claim = documents[reservation.claimPath];
    if (!claim || claim.status !== "reserved") return { writes: [], result: undefined };
    const owned = typeof capacity?.owned === "number" ? capacity.owned : 0;
    const now = new Date().toISOString();
    const ownsCurrentReservation = capacity?.reservationRequestId === reservation.requestId;
    return {
      writes: [
        ...(ownsCurrentReservation ? [{
          path: reservation.capacityPath,
          data: {
            ...(capacity ?? {}),
            owned: Math.max(0, owned - 1),
            reservationRequestId: null,
            reservationExpiresAt: null,
            updatedAt: now,
          },
        }] : []),
        { path: reservation.claimPath, data: { ...claim, status: "released", updatedAt: now } },
      ],
      result: undefined,
    };
  });
}

export async function reconcileCourseCapacity(uid: string) {
  const owned = (await listOwnerCourses(uid)).length;
  const capacityPath = `users/${uid}/courseCapacity/current`;
  await runStoredDocumentTransaction([capacityPath], (documents) => ({
    writes: [{
      path: capacityPath,
      data: {
        ...(documents[capacityPath] ?? {}),
        uid,
        owned,
        reservationRequestId: null,
        reservationExpiresAt: null,
        updatedAt: new Date().toISOString(),
      },
    }],
    result: undefined,
  }));
}
