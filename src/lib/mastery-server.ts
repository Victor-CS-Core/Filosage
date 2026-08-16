import { createHash } from "node:crypto";
import type { Course } from "@/lib/course-types";
import type { CapstoneAssessment } from "@/lib/learning-types";
import type { MasteryEvidence } from "@/lib/mastery";

function verifiedCapstoneEvidenceId(courseId: string, objectiveId: string) {
  const fingerprint = createHash("sha256").update(`${courseId}:${objectiveId}`).digest("hex").slice(0, 20);
  return `server_capstone_${fingerprint}`;
}

export function verifiedCapstoneMasteryEvidence(
  courseId: string,
  course: Pick<Course, "modules" | "capstone">,
  assessment: CapstoneAssessment | null | undefined,
): MasteryEvidence[] {
  if (assessment?.status !== "passed" || !assessment.assessedAt) return [];
  const objectiveIds = course.capstone?.objectiveIds?.length
    ? course.capstone.objectiveIds
    : course.modules.map((courseModule, moduleIndex) => courseModule.objectiveId ?? `objective-m${moduleIndex}`);
  return objectiveIds.map((objectiveId, moduleIndex) => ({
    id: verifiedCapstoneEvidenceId(courseId, objectiveId),
    courseId,
    objectiveId,
    type: "capstone",
    result: "passed",
    authority: "server-verified",
    label: `Capstone demonstrated: ${course.modules[moduleIndex]?.objective ?? course.modules[moduleIndex]?.title ?? objectiveId}`.slice(0, 300),
    observedAt: assessment.assessedAt,
    confidence: "high",
    score: 1,
    criterion: course.capstone?.title.slice(0, 300),
  }));
}
