import type { Course, LessonData, LessonMode } from "@/lib/course-types";
import { inspectGeneratedContent } from "@/lib/content-language";
import { courseQualityIssues } from "@/lib/course-quality";
import {
  COURSE_PIPELINE_VERSIONS,
  supportsGroundedSourcePolicy,
  supportsStructuredSourcePolicy,
  type PublicationDecision,
  type ValidationIssue,
  type ValidationReport,
} from "@/lib/course-pipeline/contract";
import { COURSE_QUALITY_RULE_CODES, COURSE_QUALITY_RULES, issueFromRule } from "@/lib/course-pipeline/rules";
import { isLegacyRenderableInteractionType, isRegisteredLabType } from "@/lib/course-pipeline/labs/registry";
import { isRegisteredVisualType } from "@/lib/course-pipeline/visuals/registry";
import { lessonQualityIssues } from "@/lib/lesson-quality";
import { publicationCandidateContentHash } from "@/lib/publication-content";
import {
  assignedSourcePack,
  lessonCitationQualityIssues,
  outlineSourceAssignmentIssues,
  outlineSourceCoverageIssues,
  isSafePublicSourceUrl,
  sourcePackQualityIssues,
} from "@/lib/source-safety";
import {
  isLegacyCourseCandidate,
  isLegacyLessonCandidate,
  parseCourseCandidate,
  parseLessonCandidate,
} from "@/lib/course-pipeline/compatibility";
import { labPlanSchema, visualPlanSchema } from "@/lib/course-pipeline/schemas";
import { effectiveCourseReviewPolicy } from "@/lib/course-pipeline/review-policy";
import { automaticCitationGroundingIssues, groundedSourcePackIssues } from "@/lib/source-research";
import {
  COURSE_GROUNDING_EVALUATOR_VERSION,
  courseGroundingFingerprint,
  courseGroundingIssues,
  type CourseGroundingResult,
} from "@/lib/source-grounding";

function issuePath(prefix: string, path: PropertyKey[]) {
  return path.length ? `${prefix}.${path.map(String).join(".")}` : prefix;
}

function lessonIssue(message: string, path: string): ValidationIssue {
  if (message === "The explanation is too shallow.") {
    return issueFromRule(COURSE_QUALITY_RULES.CONCISE_EXPLANATION, `${path}.content`, message);
  }
  if (message.includes("Recognition v2") || message.includes("recognition lab")) {
    return issueFromRule(COURSE_QUALITY_RULES.LAB_OPTIONAL_MISSING, `${path}.interactions`, message);
  }
  if (message.includes("learning objective")) {
    return issueFromRule(COURSE_QUALITY_RULES.OBJECTIVE_MISSING, `${path}.learningObjective`, message);
  }
  if (message.includes("curricular connection")) {
    return issueFromRule(COURSE_QUALITY_RULES.CONNECTION_MISSING, `${path}.connection`, message);
  }
  if (message.includes("mode-specific activity") || message.startsWith("The activity must use")) {
    return issueFromRule(COURSE_QUALITY_RULES.MODE_ACTIVITY_MISSING, `${path}.experience`, message);
  }
  if (message.includes("quiz") || message.includes("transfer task") || message.includes("Guided practice")) {
    return issueFromRule(COURSE_QUALITY_RULES.ASSESSMENT_MISSING, path, message);
  }
  if (message.includes("takeaway")) {
    return issueFromRule(COURSE_QUALITY_RULES.LESSON_COMPLETENESS, `${path}.keyTakeaways`, message);
  }
  if (message.includes("Markdown")) {
    return issueFromRule(COURSE_QUALITY_RULES.CONTENT_INTEGRITY, path, message);
  }
  if (message.includes("diagram and graph syntax")) {
    return issueFromRule(COURSE_QUALITY_RULES.VISUAL_OPTIONAL_MISSING, `${path}.content`, message);
  }
  if (message.includes("unexpected") || message.includes("model-control") || message.includes("malformed")) {
    return issueFromRule(COURSE_QUALITY_RULES.CONTENT_INTEGRITY, path, message);
  }
  if (message.includes("does not satisfy the requested")) {
    return issueFromRule(COURSE_QUALITY_RULES.LANGUAGE_CONFORMANCE, path, message);
  }
  return issueFromRule(COURSE_QUALITY_RULES.LESSON_COMPLETENESS, path, message);
}

function outlineIssue(message: string): ValidationIssue {
  if (message.includes("distinct teaching modes") || message.includes("teaching mode repeats")) {
    return issueFromRule(COURSE_QUALITY_RULES.MODE_VARIETY, "modules", message);
  }
  if (message.includes("prerequisite")) {
    return issueFromRule(COURSE_QUALITY_RULES.PREREQUISITE_INVALID, "modules", message);
  }
  if (message.includes("title") && message.includes("duplicates")) {
    return issueFromRule(COURSE_QUALITY_RULES.DUPLICATE_LESSON, "modules", message);
  }
  if (message.includes("activity") || message.includes("artifact contribution") || message.includes("milestone deliverable")) {
    return issueFromRule(COURSE_QUALITY_RULES.MODE_VARIETY, "modules", message);
  }
  if (message.includes("success criterion")) {
    return issueFromRule(COURSE_QUALITY_RULES.ASSESSMENT_MISSING, "course.capstone.successCriteria", message);
  }
  if (message.includes("capstone") || message.includes("deliverable from the evidence")) {
    return issueFromRule(COURSE_QUALITY_RULES.COURSE_COHERENCE, "course", message);
  }
  if (message.includes("module challenge")) {
    return issueFromRule(COURSE_QUALITY_RULES.COURSE_COHERENCE, "course.modules", message);
  }
  return issueFromRule(COURSE_QUALITY_RULES.OBJECTIVE_MISSING, "course", message);
}

function inspectRegisteredCapabilities(raw: Record<string, unknown>, lessonPath: string) {
  const issues: ValidationIssue[] = [];
  if (Array.isArray(raw.interactions)) {
    raw.interactions.forEach((interaction, index) => {
      const type = interaction && typeof interaction === "object" ? String((interaction as Record<string, unknown>).type ?? "") : "";
      const isLegacyCompatible = !raw.labPlan && isLegacyRenderableInteractionType(type);
      if (type && !isRegisteredLabType(type) && !isLegacyCompatible) {
        issues.push(issueFromRule(COURSE_QUALITY_RULES.LAB_UNSUPPORTED, `${lessonPath}.interactions[${index}]`, `The lab type ${type} is not registered.`));
      }
    });
  }
  if (Array.isArray(raw.visuals)) {
    raw.visuals.forEach((visual, index) => {
      const type = visual && typeof visual === "object" ? String((visual as Record<string, unknown>).type ?? "") : "";
      if (type && !isRegisteredVisualType(type)) {
        issues.push(issueFromRule(COURSE_QUALITY_RULES.VISUAL_UNSUPPORTED, `${lessonPath}.visuals[${index}]`, `The instructional visual type ${type} is not registered.`));
      }
    });
  }
  return issues;
}

function inspectApplicabilityPlans(raw: Record<string, unknown>, lessonPath: string) {
  const findings: ValidationIssue[] = [];
  const interactions = Array.isArray(raw.interactions) ? raw.interactions : [];
  const visuals = Array.isArray(raw.visuals) ? raw.visuals : [];
  const lessonObjectiveIds = Array.isArray(raw.objectiveIds) ? raw.objectiveIds.map(String) : [];
  const labPlan = raw.labPlan !== undefined ? labPlanSchema.safeParse(raw.labPlan) : null;
  const visualPlan = raw.visualPlan !== undefined ? visualPlanSchema.safeParse(raw.visualPlan) : null;
  if (labPlan && !labPlan.success) {
    labPlan.error.issues.forEach((issue) => findings.push(issueFromRule(
      COURSE_QUALITY_RULES.LAB_PLAN_INVALID,
      issuePath(`${lessonPath}.labPlan`, issue.path),
      `The lab plan is invalid: ${issue.message}`,
    )));
  } else if (labPlan?.success) {
    const { applicability, objectiveIds } = labPlan.data;
    if (objectiveIds.some((objectiveId) => !lessonObjectiveIds.includes(objectiveId))) {
      findings.push(issueFromRule(COURSE_QUALITY_RULES.OBJECTIVE_RELATIONSHIP, `${lessonPath}.labPlan.objectiveIds`, "The lab plan references an objective that is not assigned to this lesson."));
    }
    if (applicability === "required" && interactions.length === 0) {
      findings.push(issueFromRule(COURSE_QUALITY_RULES.LAB_REQUIRED_MISSING, `${lessonPath}.interactions`, "The objective plan requires a lab, but no registered interaction is present."));
    } else if (applicability === "recommended" && interactions.length === 0) {
      findings.push(issueFromRule(COURSE_QUALITY_RULES.LAB_OPTIONAL_MISSING, `${lessonPath}.interactions`, "A lab is recommended for this objective, but the complete lesson remains publishable without it."));
    }
    interactions.forEach((interaction, index) => {
      const mapped = interaction && typeof interaction === "object" && Array.isArray((interaction as Record<string, unknown>).objectiveIds)
        ? ((interaction as Record<string, unknown>).objectiveIds as unknown[]).map(String)
        : [];
      if (objectiveIds.some((objectiveId) => !mapped.includes(objectiveId))) {
        findings.push(issueFromRule(COURSE_QUALITY_RULES.OBJECTIVE_RELATIONSHIP, `${lessonPath}.interactions[${index}].objectiveIds`, "The lab is not mapped to the objective in its applicability plan."));
      }
    });
  }
  if (visualPlan && !visualPlan.success) {
    visualPlan.error.issues.forEach((issue) => findings.push(issueFromRule(
      COURSE_QUALITY_RULES.VISUAL_PLAN_INVALID,
      issuePath(`${lessonPath}.visualPlan`, issue.path),
      `The visual plan is invalid: ${issue.message}`,
    )));
  } else if (visualPlan?.success) {
    const { applicability, objectiveIds, accessibleFallback } = visualPlan.data;
    if (objectiveIds.some((objectiveId) => !lessonObjectiveIds.includes(objectiveId))) {
      findings.push(issueFromRule(COURSE_QUALITY_RULES.OBJECTIVE_RELATIONSHIP, `${lessonPath}.visualPlan.objectiveIds`, "The visual plan references an objective that is not assigned to this lesson."));
    }
    if (applicability === "essential" && visuals.length === 0 && !accessibleFallback) {
      findings.push(issueFromRule(COURSE_QUALITY_RULES.VISUAL_ESSENTIAL_MISSING, `${lessonPath}.visualPlan.accessibleFallback`, "The objective plan marks an instructional visual essential, but no registered visual or explicit fallback is present."));
    } else if (applicability === "helpful" && visuals.length === 0) {
      findings.push(issueFromRule(COURSE_QUALITY_RULES.VISUAL_OPTIONAL_MISSING, `${lessonPath}.visuals`, "A structured visual could help this objective, but its absence does not block the complete lesson."));
    }
    visuals.forEach((visual, index) => {
      const mapped = visual && typeof visual === "object" && Array.isArray((visual as Record<string, unknown>).objectiveIds)
        ? ((visual as Record<string, unknown>).objectiveIds as unknown[]).map(String)
        : [];
      if (objectiveIds.some((objectiveId) => !mapped.includes(objectiveId))) {
        findings.push(issueFromRule(COURSE_QUALITY_RULES.OBJECTIVE_RELATIONSHIP, `${lessonPath}.visuals[${index}].objectiveIds`, "The visual is not mapped to the objective in its applicability plan."));
      }
    });
  }
  return findings;
}

function inspectObjectiveRelationships(
  course: Course & Record<string, unknown>,
  lessonsById: Map<string, Record<string, unknown>>,
) {
  if (Number(course.courseSchemaVersion ?? 0) < COURSE_PIPELINE_VERSIONS.courseSchema) return [];
  const issues: ValidationIssue[] = [];
  const objectives = Array.isArray(course.objectives)
    ? course.objectives.filter((item): item is NonNullable<Course["objectives"]>[number] => Boolean(item) && typeof item === "object")
    : [];
  const objectiveIds = objectives.map((objective) => String(objective.id ?? ""));
  const objectiveIdSet = new Set(objectiveIds);
  if (!objectiveIds.length || objectiveIdSet.size !== objectiveIds.length || objectiveIds.some((id) => !/^objective-(?:course|m\d+(?:-l\d+)?)$/.test(id))) {
    issues.push(issueFromRule(
      COURSE_QUALITY_RULES.OBJECTIVE_RELATIONSHIP,
      "course.objectives",
      "The V2 objective registry is missing, duplicated, or contains an invalid stable ID.",
    ));
  }
  const requiredLessonObjectiveIds: string[] = [];
  course.modules.forEach((courseModule, moduleIndex) => {
    const moduleObjectiveId = courseModule.objectiveId;
    if (!moduleObjectiveId || !objectiveIdSet.has(moduleObjectiveId)) {
      issues.push(issueFromRule(
        COURSE_QUALITY_RULES.OBJECTIVE_RELATIONSHIP,
        `course.modules[${moduleIndex}].objectiveId`,
        "The module objective does not reference the V2 objective registry.",
      ));
    }
    const challengeObjectiveIds = courseModule.challenge?.objectiveIds ?? [];
    if (!moduleObjectiveId || !challengeObjectiveIds.includes(moduleObjectiveId)) {
      issues.push(issueFromRule(
        COURSE_QUALITY_RULES.ASSESSMENT_RELATIONSHIP,
        `course.modules[${moduleIndex}].challenge.objectiveIds`,
        "The module challenge is not mapped to its module objective.",
      ));
    }
    courseModule.lessons.forEach((lessonSummary, lessonIndex) => {
      const lessonId = `${moduleIndex}-${lessonIndex}`;
      const objectiveId = lessonSummary.objectiveId;
      if (!objectiveId || !objectiveIdSet.has(objectiveId)) {
        issues.push(issueFromRule(
          COURSE_QUALITY_RULES.OBJECTIVE_RELATIONSHIP,
          `course.modules[${moduleIndex}].lessons[${lessonIndex}].objectiveId`,
          "The lesson does not reference a stable objective from the V2 registry.",
        ));
        return;
      }
      requiredLessonObjectiveIds.push(objectiveId);
      const rawLesson = lessonsById.get(lessonId);
      if (!rawLesson) return;
      const lessonObjectiveIds = Array.isArray(rawLesson.objectiveIds) ? rawLesson.objectiveIds.map(String) : [];
      if (!lessonObjectiveIds.includes(objectiveId)) {
        issues.push(issueFromRule(
          COURSE_QUALITY_RULES.OBJECTIVE_RELATIONSHIP,
          `lessons[${JSON.stringify(lessonId)}].objectiveIds`,
          "The generated lesson is not mapped to its planned objective.",
        ));
      }
      const quizzes = Array.isArray(rawLesson.quizzes) ? rawLesson.quizzes : [];
      quizzes.forEach((quiz, quizIndex) => {
        const mapped = quiz && typeof quiz === "object" && Array.isArray((quiz as Record<string, unknown>).objectiveIds)
          ? ((quiz as Record<string, unknown>).objectiveIds as unknown[]).map(String)
          : [];
        if (!mapped.includes(objectiveId)) {
          issues.push(issueFromRule(
            COURSE_QUALITY_RULES.ASSESSMENT_RELATIONSHIP,
            `lessons[${JSON.stringify(lessonId)}].quizzes[${quizIndex}].objectiveIds`,
            "The assessment is not mapped to the objective taught by this lesson.",
          ));
        }
      });
    });
  });
  const capstoneObjectiveIds = Array.isArray(course.capstone?.objectiveIds) ? course.capstone.objectiveIds : [];
  const uncovered = requiredLessonObjectiveIds.filter((objectiveId) => !capstoneObjectiveIds.includes(objectiveId));
  if (uncovered.length) {
    issues.push(issueFromRule(
      COURSE_QUALITY_RULES.ASSESSMENT_RELATIONSHIP,
      "course.capstone.objectiveIds",
      `The capstone does not assess required objectives: ${uncovered.join(", ")}.`,
      { evidence: uncovered },
    ));
  }
  return issues;
}

export async function validateCourseCandidateV2(
  course: Course & Record<string, unknown>,
  lessons: Array<Record<string, unknown>>,
  expectedLessonIds: string[],
  expectedModesByLessonId: Readonly<Record<string, LessonMode | undefined>> = {},
): Promise<ValidationReport> {
  const courseId = String(course.id ?? course.courseId ?? "unpersisted-course");
  const lessonsById = new Map(lessons.map((lesson) => [String(lesson.id ?? ""), lesson]));
  const orderedLessons = expectedLessonIds.map((lessonId) => lessonsById.get(lessonId) ?? { missingLessonId: lessonId });
  const snapshotHash = await publicationCandidateContentHash(course, orderedLessons);
  const findings: ValidationIssue[] = [];
  let legacyReviewRequired = false;
  const executedCodes = new Set<string>([
    COURSE_QUALITY_RULES.COURSE_SCHEMA.code,
    COURSE_QUALITY_RULES.LESSON_MISSING.code,
    COURSE_QUALITY_RULES.LESSON_SCHEMA.code,
    COURSE_QUALITY_RULES.LAB_UNSUPPORTED.code,
    COURSE_QUALITY_RULES.VISUAL_UNSUPPORTED.code,
    COURSE_QUALITY_RULES.SOURCE_UNSAFE.code,
    COURSE_QUALITY_RULES.SOURCE_REVIEW_REQUIRED.code,
  ]);
  const parsedCourse = parseCourseCandidate(course);
  const legacyCourse = isLegacyCourseCandidate(course);
  if (legacyCourse) {
    legacyReviewRequired = true;
    executedCodes.add(COURSE_QUALITY_RULES.LEGACY_ADAPTER.code);
    executedCodes.add(COURSE_QUALITY_RULES.LEGACY_REVIEW_REQUIRED.code);
    findings.push(issueFromRule(
      COURSE_QUALITY_RULES.LEGACY_ADAPTER,
      "course.schemaVersion",
      "This course uses the supported legacy compatibility adapter and was not rewritten.",
    ));
  }

  if (Number(course.courseSchemaVersion ?? 0) >= COURSE_PIPELINE_VERSIONS.courseSchema) {
    executedCodes.add(COURSE_QUALITY_RULES.OBJECTIVE_RELATIONSHIP.code);
    executedCodes.add(COURSE_QUALITY_RULES.ASSESSMENT_RELATIONSHIP.code);
    findings.push(...inspectObjectiveRelationships(course, lessonsById));
  }

  if (supportsStructuredSourcePolicy(course.sourcePolicyVersion)) {
    executedCodes.add(COURSE_QUALITY_RULES.SOURCE_ASSIGNMENT_INVALID.code);
    findings.push(...outlineSourceCoverageIssues(course, course.sourcePack ?? []).map((message) => issueFromRule(
      COURSE_QUALITY_RULES.SOURCE_ASSIGNMENT_INVALID,
      "course.modules",
      message,
    )));
  }
  if (supportsGroundedSourcePolicy(course.sourcePolicyVersion)) {
    executedCodes.add(COURSE_QUALITY_RULES.SOURCE_RESEARCH_INVALID.code);
    findings.push(...groundedSourcePackIssues(course.sourcePack ?? []).map((message) => issueFromRule(
      COURSE_QUALITY_RULES.SOURCE_RESEARCH_INVALID,
      "course.sourcePack",
      message,
    )));
    const expectedGroundingFingerprint = courseGroundingFingerprint(course, course.sourcePack ?? []);
    if (course.sourceGroundingEvaluatorStatus !== "executed"
      || course.sourceGroundingEvaluatorVersion !== COURSE_GROUNDING_EVALUATOR_VERSION
      || course.sourceGroundingFingerprint !== expectedGroundingFingerprint
      || !Array.isArray(course.sourceGroundingAssessments)) {
      findings.push(issueFromRule(
        COURSE_QUALITY_RULES.SOURCE_RESEARCH_INVALID,
        "course.sourceGroundingEvaluatorStatus",
        "The course lacks a persisted automatic outline-grounding result.",
      ));
    } else {
      findings.push(...courseGroundingIssues(
        { assessments: course.sourceGroundingAssessments } as CourseGroundingResult,
        course,
        course.sourcePack ?? [],
      ).map((message) => issueFromRule(
        COURSE_QUALITY_RULES.SOURCE_RESEARCH_INVALID,
        "course.sourceGroundingAssessments",
        message,
      )));
    }
  }

  if (!parsedCourse.success) {
    parsedCourse.error.issues.forEach((issue) => {
      findings.push(issueFromRule(COURSE_QUALITY_RULES.COURSE_SCHEMA, issuePath("course", issue.path), issue.message));
    });
  } else if (!legacyCourse) {
    [
      COURSE_QUALITY_RULES.OBJECTIVE_MISSING,
      COURSE_QUALITY_RULES.CONNECTION_MISSING,
      COURSE_QUALITY_RULES.COURSE_COHERENCE,
      COURSE_QUALITY_RULES.MODE_VARIETY,
      COURSE_QUALITY_RULES.PREREQUISITE_INVALID,
      COURSE_QUALITY_RULES.DUPLICATE_LESSON,
      COURSE_QUALITY_RULES.LESSON_COMPLETENESS,
      COURSE_QUALITY_RULES.CONTENT_INTEGRITY,
      COURSE_QUALITY_RULES.LANGUAGE_CONFORMANCE,
    ].forEach((rule) => executedCodes.add(rule.code));
    findings.push(...courseQualityIssues(parsedCourse.data).map(outlineIssue));
    findings.push(...inspectGeneratedContent(parsedCourse.data, course.topic, course.language ?? "English").map((issue) =>
      issueFromRule(
        issue.reason.includes("does not satisfy the requested") ? COURSE_QUALITY_RULES.LANGUAGE_CONFORMANCE : COURSE_QUALITY_RULES.CONTENT_INTEGRITY,
        `course.${issue.path}`,
        issue.reason,
      ),
    ));
  }

  expectedLessonIds.forEach((lessonId) => {
    const raw = lessonsById.get(lessonId);
    const path = `lessons[${JSON.stringify(lessonId)}]`;
    if (!raw) {
      findings.push(issueFromRule(COURSE_QUALITY_RULES.LESSON_MISSING, path, "The outlined lesson has not been generated."));
      return;
    }
    findings.push(...inspectRegisteredCapabilities(raw, path));
    findings.push(...inspectApplicabilityPlans(raw, path));
    if (raw.labPlan !== undefined) {
      executedCodes.add(COURSE_QUALITY_RULES.LAB_PLAN_INVALID.code);
      executedCodes.add(COURSE_QUALITY_RULES.LAB_REQUIRED_MISSING.code);
      executedCodes.add(COURSE_QUALITY_RULES.LAB_OPTIONAL_MISSING.code);
      executedCodes.add(COURSE_QUALITY_RULES.OBJECTIVE_RELATIONSHIP.code);
    }
    if (raw.visualPlan !== undefined) {
      executedCodes.add(COURSE_QUALITY_RULES.VISUAL_PLAN_INVALID.code);
      executedCodes.add(COURSE_QUALITY_RULES.VISUAL_ESSENTIAL_MISSING.code);
      executedCodes.add(COURSE_QUALITY_RULES.VISUAL_OPTIONAL_MISSING.code);
      executedCodes.add(COURSE_QUALITY_RULES.OBJECTIVE_RELATIONSHIP.code);
    }
    if (supportsStructuredSourcePolicy(course.sourcePolicyVersion)) {
      executedCodes.add(COURSE_QUALITY_RULES.SOURCE_ASSIGNMENT_INVALID.code);
      executedCodes.add(COURSE_QUALITY_RULES.SOURCE_CITATION_INVALID.code);
      const [moduleIndex, lessonIndex] = lessonId.split("-").map(Number);
      const lessonSummary = course.modules[moduleIndex]?.lessons[lessonIndex];
      const assignedSources = assignedSourcePack(course.sourcePack ?? [], lessonSummary?.sourceIds);
      const assignmentIssues = outlineSourceAssignmentIssues({ modules: [{ lessons: [{ sourceIds: lessonSummary?.sourceIds }] }] }, course.sourcePack ?? []);
      findings.push(...assignmentIssues.map((message) => issueFromRule(
        COURSE_QUALITY_RULES.SOURCE_ASSIGNMENT_INVALID,
        `${path}.sourceIds`,
        message,
      )));
      const rawCitations = Array.isArray(raw.citations) ? raw.citations : [];
      findings.push(...lessonCitationQualityIssues(rawCitations as NonNullable<LessonData["citations"]>, assignedSources, raw as Partial<LessonData>).map((message) => issueFromRule(
        COURSE_QUALITY_RULES.SOURCE_CITATION_INVALID,
        `${path}.citations`,
        message,
      )));
      if (supportsGroundedSourcePolicy(course.sourcePolicyVersion)) {
        executedCodes.add(COURSE_QUALITY_RULES.SOURCE_RESEARCH_INVALID.code);
        findings.push(...automaticCitationGroundingIssues(rawCitations, assignedSources, raw).map((message) => issueFromRule(
          COURSE_QUALITY_RULES.SOURCE_RESEARCH_INVALID,
          `${path}.citations`,
          message,
        )));
      }
    }
    const parsed = parseLessonCandidate(raw);
    const legacyLesson = isLegacyLessonCandidate(raw);
    if (legacyLesson) {
      legacyReviewRequired = true;
      executedCodes.add(COURSE_QUALITY_RULES.LEGACY_REVIEW_REQUIRED.code);
      executedCodes.add(COURSE_QUALITY_RULES.LEGACY_ADAPTER.code);
      if (!findings.some((issue) => issue.code === COURSE_QUALITY_RULES.LEGACY_ADAPTER.code)) {
        findings.push(issueFromRule(
          COURSE_QUALITY_RULES.LEGACY_ADAPTER,
          `${path}.schemaVersion`,
          "This lesson uses the supported legacy compatibility adapter and was not regenerated.",
        ));
      }
    }
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        findings.push(issueFromRule(COURSE_QUALITY_RULES.LESSON_SCHEMA, issuePath(path, issue.path), issue.message));
      });
      return;
    }
    if (legacyLesson) return;
    const lesson = parsed.data as LessonData;
    const lessonKind = typeof raw.lessonKind === "string"
      ? raw.lessonKind as LessonData["lessonKind"]
      : "substantive";
    [
      COURSE_QUALITY_RULES.OBJECTIVE_MISSING,
      COURSE_QUALITY_RULES.CONNECTION_MISSING,
      COURSE_QUALITY_RULES.MODE_ACTIVITY_MISSING,
      COURSE_QUALITY_RULES.ASSESSMENT_MISSING,
      COURSE_QUALITY_RULES.CONCISE_EXPLANATION,
      COURSE_QUALITY_RULES.LESSON_COMPLETENESS,
      COURSE_QUALITY_RULES.LAB_OPTIONAL_MISSING,
      COURSE_QUALITY_RULES.VISUAL_OPTIONAL_MISSING,
      COURSE_QUALITY_RULES.CONTENT_INTEGRITY,
      COURSE_QUALITY_RULES.LANGUAGE_CONFORMANCE,
    ].forEach((rule) => executedCodes.add(rule.code));
    findings.push(...lessonQualityIssues(lesson, course.topic, expectedModesByLessonId[lessonId], {
      requireInteractionV2: false,
      lessonKind,
      instructionLanguage: course.language ?? "English",
    })
      .map((message) => lessonIssue(message, path)));
  });

  for (const [index, source] of (course.sourcePack ?? []).entries()) {
    if (source.url && !isSafePublicSourceUrl(source.url)) {
      findings.push(issueFromRule(COURSE_QUALITY_RULES.SOURCE_UNSAFE, `course.sourcePack[${index}].url`, `${source.label} does not use a safe public HTTPS destination.`));
    }
  }
  const sourceQualityMessages = sourcePackQualityIssues(course.sourcePack)
    .filter((message) => !findings.some((issue) => issue.message === message));
  findings.push(...sourceQualityMessages.map((message) =>
    issueFromRule(COURSE_QUALITY_RULES.SOURCE_REVIEW_REQUIRED, "course.sourcePack", message, { severity: "warning", repairability: "manual" }),
  ));

  const manualReviewPolicy = effectiveCourseReviewPolicy(course);
  const runtimeReviewRequired = true;
  const policyReviewRequired = (course as Record<string, unknown>).requiresManualReview === true
    || manualReviewPolicy.required
    || legacyReviewRequired;
  const requiresManualReview = policyReviewRequired || runtimeReviewRequired;
  if (legacyReviewRequired) {
    findings.push(issueFromRule(
      COURSE_QUALITY_RULES.LEGACY_REVIEW_REQUIRED,
      "course.schemaVersion",
      "This preserved legacy draft does not contain enough current objective and assessment metadata to self-certify. A human must review this exact snapshot.",
    ));
  }
  if (policyReviewRequired) {
    findings.push(issueFromRule(
      COURSE_QUALITY_RULES.SOURCE_REVIEW_REQUIRED,
      "course.manualReviewPolicy",
      manualReviewPolicy.reasonCodes.length
        ? `Human review is required for: ${manualReviewPolicy.reasonCodes.join(", ")}.`
        : "This course is explicitly marked for human review.",
    ));
  }
  findings.push(
    issueFromRule(
      COURSE_QUALITY_RULES.SEMANTIC_REVIEW_REQUIRED,
      "course",
      "The calibrated semantic and claim-support evaluator has not executed for this snapshot. Owner review is required before publication.",
    ),
    issueFromRule(
      COURSE_QUALITY_RULES.ACCESSIBILITY_RUNTIME_REVIEW,
      "course.runtime",
      "Automated runtime accessibility verification has not executed for this snapshot. Owner review is required before publication.",
    ),
    issueFromRule(
      COURSE_QUALITY_RULES.ASSET_AVAILABILITY_REVIEW,
      "course.assets",
      "Runtime asset-availability verification has not executed for this snapshot. Owner review is required before publication.",
    ),
  );
  const warnings = findings.filter((issue) => issue.severity === "warning" || issue.severity === "info");
  const issues = findings.filter((issue) => issue.severity === "blocker" || issue.severity === "error");
  const failedCodes = new Set(findings.map((issue) => issue.code));

  return {
    courseId,
    snapshotHash,
    contractVersion: COURSE_PIPELINE_VERSIONS.qualityContract,
    validatedAt: new Date().toISOString(),
    publishable: issues.length === 0 && !requiresManualReview,
    requiresManualReview,
    issues,
    warnings,
    passedRuleCodes: COURSE_QUALITY_RULE_CODES.filter((code) => executedCodes.has(code) && !failedCodes.has(code)),
    evaluatorMetadata: {
      deterministicOnly: true,
      executedRuleCodes: [...executedCodes],
      skippedLanes: ["semantic", "claim_support", "accessibility_runtime", "asset_availability"],
    },
  };
}

export function publicationDecisionFromReport(report: ValidationReport): PublicationDecision {
  const nonManualIssues = report.issues.filter((issue) => issue.repairability !== "manual");
  const automaticRepairAvailable = nonManualIssues.some((issue) => issue.repairability === "automatic");
  const decision = nonManualIssues.length > 0
    ? automaticRepairAvailable
      ? "needs_repair" as const
      : "blocked" as const
    : report.requiresManualReview
      ? "manual_review" as const
      : report.publishable
      ? "publishable" as const
      : "blocked" as const;
  return {
    decision,
    snapshotHash: report.snapshotHash,
    contractVersion: report.contractVersion,
    report,
    automaticRepairAvailable,
  };
}
