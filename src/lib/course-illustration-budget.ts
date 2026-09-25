import "server-only";

import {
  COURSE_ILLUSTRATION_BUDGET_MICROS,
  type CourseIllustrationBudgetTier,
} from "@/lib/course-illustration-budget-policy";
import {
  getStoredDocument,
  runStoredDocumentTransaction,
  type StoredDocument,
} from "@/lib/document-store";

export type { CourseIllustrationBudgetTier };
export { COURSE_ILLUSTRATION_BUDGET_MICROS, budgetTierForAccount } from "@/lib/course-illustration-budget-policy";

export class CourseIllustrationBudgetExceededError extends Error {
  constructor(readonly courseId: string) {
    super(`Course illustration budget exceeded for course ${courseId}.`);
    this.name = "CourseIllustrationBudgetExceededError";
  }
}

interface CourseIllustrationBudgetDocument {
  courseId: string;
  tier: CourseIllustrationBudgetTier;
  capMicros: number;
  reservations: Record<string, number>;
  spentMicros: number;
  updatedAt: string;
}

function budgetPath(courseId: string) {
  return `courseIllustrationBudgets/${courseId}`;
}

/** Validate an untyped stored document into the budget shape; foreign-shaped docs are ignored. */
function asBudgetDocument(value: StoredDocument | null | undefined): CourseIllustrationBudgetDocument | undefined {
  if (!value) return undefined;
  if (typeof value.courseId !== "string") return undefined;
  if (typeof value.capMicros !== "number" || typeof value.spentMicros !== "number") return undefined;
  const reservations = value.reservations;
  if (reservations !== undefined && (typeof reservations !== "object" || reservations === null)) return undefined;
  const cleanReservations: Record<string, number> = {};
  for (const [id, cost] of Object.entries((reservations ?? {}) as Record<string, unknown>)) {
    if (typeof cost === "number" && Number.isSafeInteger(cost) && cost >= 0) cleanReservations[id] = cost;
  }
  return {
    courseId: value.courseId,
    tier: value.tier === "pro" ? "pro" : "plus",
    capMicros: value.capMicros,
    reservations: cleanReservations,
    spentMicros: value.spentMicros,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

function outstandingMicros(doc: CourseIllustrationBudgetDocument) {
  let reserved = 0;
  for (const cost of Object.values(doc.reservations)) reserved += cost;
  return doc.spentMicros + reserved;
}

/**
 * Reserve `costMicros` against the course's illustration budget. Returns a
 * reservation id, or null when the spend would exceed the hard cap. A
 * returned reservation must later be settled with
 * settleCourseIllustrationBudget — exactly once per outcome, though settle
 * itself is idempotent. The check-and-reserve runs in a single document
 * transaction, so concurrent lesson generations cannot jointly overshoot.
 */
export async function reserveCourseIllustrationBudget(
  courseId: string,
  tier: CourseIllustrationBudgetTier,
  costMicros: number,
): Promise<string | null> {
  if (!courseId || !Number.isSafeInteger(costMicros) || costMicros < 0) return null;
  const reservationId = crypto.randomUUID();
  const path = budgetPath(courseId);
  return runStoredDocumentTransaction([path], (documents) => {
    const existing = asBudgetDocument(documents[path]);
    const now = new Date().toISOString();
    const doc: CourseIllustrationBudgetDocument = existing ?? {
      courseId,
      tier,
      capMicros: COURSE_ILLUSTRATION_BUDGET_MICROS[tier],
      reservations: {},
      spentMicros: 0,
      updatedAt: now,
    };
    // A course that already holds a budget keeps its original tier and cap.
    if (outstandingMicros(doc) + costMicros > doc.capMicros) {
      return { writes: [], result: null as string | null };
    }
    return {
      writes: [{
        path,
        data: {
          ...doc,
          reservations: { ...doc.reservations, [reservationId]: costMicros },
          updatedAt: now,
        },
      }],
      result: reservationId as string | null,
    };
  });
}

/**
 * Settle a budget reservation. "spent" moves the reserved amount into the
 * spent total; "released" frees it without spending. Unknown reservation ids
 * are ignored, so settling twice (or after a retry) is safe.
 */
export async function settleCourseIllustrationBudget(
  courseId: string,
  reservationId: string,
  outcome: "spent" | "released",
): Promise<void> {
  if (!courseId || !reservationId) return;
  const path = budgetPath(courseId);
  await runStoredDocumentTransaction([path], (documents) => {
    const doc = asBudgetDocument(documents[path]);
    const cost = doc?.reservations[reservationId];
    if (!doc || cost === undefined) return { writes: [], result: undefined };
    const reservations: Record<string, number> = {};
    for (const [id, reservedCost] of Object.entries(doc.reservations)) {
      if (id !== reservationId) reservations[id] = reservedCost;
    }
    return {
      writes: [{
        path,
        data: {
          ...doc,
          reservations,
          spentMicros: outcome === "spent" ? doc.spentMicros + cost : doc.spentMicros,
          updatedAt: new Date().toISOString(),
        },
      }],
      result: undefined,
    };
  });
}

/** Read-only view of a course's illustration budget, for admin/diagnostics. */
export async function getCourseIllustrationBudget(courseId: string): Promise<(
  Omit<CourseIllustrationBudgetDocument, "reservations"> & {
    reservedMicros: number;
    outstandingMicros: number;
    reservationCount: number;
  }
) | null> {
  if (!courseId) return null;
  const doc = asBudgetDocument(await getStoredDocument(budgetPath(courseId)));
  if (!doc) return null;
  let reservedMicros = 0;
  for (const cost of Object.values(doc.reservations ?? {})) reservedMicros += cost;
  return {
    courseId: doc.courseId,
    tier: doc.tier,
    capMicros: doc.capMicros,
    spentMicros: doc.spentMicros,
    updatedAt: doc.updatedAt,
    reservedMicros,
    outstandingMicros: doc.spentMicros + reservedMicros,
    reservationCount: Object.keys(doc.reservations ?? {}).length,
  };
}
