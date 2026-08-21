import "server-only";

import type { ServerAccount } from "@/lib/account-server";
import type { Course } from "@/lib/course-types";
import { getStoredDocument, runStoredDocumentTransaction } from "@/lib/document-store";
import {
  COURSE_CREDIT_SCHEMA_VERSION,
  courseCreditInteger,
  reconcileCourseCreditLedger,
  validCourseCreditIso,
  type CourseCreditLedger,
} from "@/lib/course-credit-policy";

export interface CourseCreditSummary {
  balance: number | null;
  monthlyAllocation: number | null;
  balanceCap: number | null;
  nextAccrualAt: string | null;
  frozenUntil: string | null;
}

export interface CourseCreditReservation {
  uid: string;
  claimId: string;
  ledgerPath: string;
  claimPath: string;
  acquired: boolean;
}

export class CourseCreditError extends Error {
  readonly status = 409;
  readonly code = "COURSE_CREDITS_EXHAUSTED";

  constructor(public readonly summary: CourseCreditSummary) {
    super("You have used your available course credits. Existing courses and every lesson in their approved outlines remain available.");
  }
}

function summaryFromLedger(ledger: CourseCreditLedger): CourseCreditSummary {
  return {
    balance: ledger.balance,
    monthlyAllocation: ledger.monthlyAllocation,
    balanceCap: ledger.balanceCap,
    nextAccrualAt: ledger.nextAccrualAt,
    frozenUntil: ledger.frozenUntil,
  };
}

export async function courseCreditClaimId(uid: string, idempotencyKey: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${uid}:course-credit:${idempotencyKey}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function courseCreditSummaryForAccount(account: ServerAccount): Promise<CourseCreditSummary> {
  if (account.isOwner) {
    return { balance: null, monthlyAllocation: null, balanceCap: null, nextAccrualAt: null, frozenUntil: null };
  }
  const ledgerPath = `users/${account.uid}/courseCredits/current`;
  return runStoredDocumentTransaction([ledgerPath], (documents) => {
    const ledger = reconcileCourseCreditLedger(documents[ledgerPath], account, new Date());
    return { writes: [{ path: ledgerPath, data: ledger }], result: summaryFromLedger(ledger) };
  });
}

export async function reserveCourseCredit(account: ServerAccount, claimId: string): Promise<CourseCreditReservation | null> {
  if (account.isOwner) return null;
  const ledgerPath = `users/${account.uid}/courseCredits/current`;
  const claimPath = `users/${account.uid}/courseCreditClaims/${claimId}`;
  const acquired = await runStoredDocumentTransaction([ledgerPath, claimPath], (documents) => {
    const now = new Date();
    const ledger = reconcileCourseCreditLedger(documents[ledgerPath], account, now);
    const claim = documents[claimPath];
    if (claim?.status === "completed" || claim?.status === "reserved") {
      return { writes: [{ path: ledgerPath, data: ledger }], result: false };
    }
    if (ledger.balance <= 0) throw new CourseCreditError(summaryFromLedger(ledger));
    return {
      writes: [
        { path: ledgerPath, data: { ...ledger, balance: ledger.balance - 1, updatedAt: now.toISOString() } },
        { path: claimPath, data: { uid: account.uid, claimId, status: "reserved", reservedAt: now.toISOString(), updatedAt: now.toISOString() } },
      ],
      result: true,
    };
  });
  return { uid: account.uid, claimId, ledgerPath, claimPath, acquired };
}

export async function completeCourseCreditReservation(
  reservation: CourseCreditReservation | null,
  course: { id?: unknown; courseId?: unknown; modules?: unknown },
) {
  if (!reservation) return;
  const courseId = typeof course.id === "string" ? course.id : typeof course.courseId === "string" ? course.courseId : "";
  if (!courseId || !Array.isArray(course.modules)) throw new Error("The completed course credit is missing its course outline.");
  const coursePath = `courses/${courseId}`;
  const lessonIds = course.modules.flatMap((courseModule, moduleIndex) => {
    if (!courseModule || typeof courseModule !== "object" || !Array.isArray((courseModule as { lessons?: unknown }).lessons)) return [];
    return ((courseModule as { lessons: unknown[] }).lessons).map((_lesson, lessonIndex) => `${moduleIndex}-${lessonIndex}`);
  });
  await runStoredDocumentTransaction([reservation.claimPath, coursePath], (documents) => {
    const claim = documents[reservation.claimPath];
    const storedCourse = documents[coursePath];
    if (!claim || claim.status === "completed" || !storedCourse) return { writes: [], result: undefined };
    const now = new Date().toISOString();
    return {
      writes: [
        { path: reservation.claimPath, data: { ...claim, status: "completed", courseId, completedAt: now, updatedAt: now } },
        { path: coursePath, data: { ...storedCourse, generationGrant: { version: COURSE_CREDIT_SCHEMA_VERSION, claimId: reservation.claimId, lessonIds, redeemedAt: now, status: "active" }, updatedAt: now } },
      ],
      result: undefined,
    };
  });
}

export async function releaseCourseCreditReservation(reservation: CourseCreditReservation | null) {
  if (!reservation?.acquired) return;
  await runStoredDocumentTransaction([reservation.ledgerPath, reservation.claimPath], (documents) => {
    const ledger = documents[reservation.ledgerPath];
    const claim = documents[reservation.claimPath];
    if (!ledger || !claim || claim.status !== "reserved") return { writes: [], result: undefined };
    const now = new Date().toISOString();
    return {
      writes: [
        { path: reservation.ledgerPath, data: { ...ledger, balance: courseCreditInteger(ledger.balance) + 1, updatedAt: now } },
        { path: reservation.claimPath, data: { ...claim, status: "released", releasedAt: now, updatedAt: now } },
      ],
      result: undefined,
    };
  });
}

export function courseGenerationGrantAllows(course: Course, lessonId: string) {
  const grant = (course as Course & { generationGrant?: { status?: string; lessonIds?: unknown[] } }).generationGrant;
  if (!grant) return true;
  return grant.status === "active" && Array.isArray(grant.lessonIds) && grant.lessonIds.map(String).includes(lessonId);
}

export async function storedCourseCreditSummary(uid: string) {
  const ledger = await getStoredDocument(`users/${uid}/courseCredits/current`);
  if (!ledger) return null;
  return {
    balance: courseCreditInteger(ledger.balance),
    monthlyAllocation: courseCreditInteger(ledger.monthlyAllocation),
    balanceCap: courseCreditInteger(ledger.balanceCap),
    nextAccrualAt: validCourseCreditIso(ledger.nextAccrualAt),
    frozenUntil: validCourseCreditIso(ledger.frozenUntil),
  } satisfies CourseCreditSummary;
}
