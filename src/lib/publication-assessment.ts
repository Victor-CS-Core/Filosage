import type { Course, LessonMode } from "@/lib/course-types";
import { inspectGeneratedContent } from "@/lib/content-language";
import { courseQualityIssues, COURSE_QUALITY_GATE_VERSION } from "@/lib/course-quality";
import { LESSON_QUALITY_GATE_VERSION } from "@/lib/lesson-quality";
import {
  inspectCoursePublishReadiness,
  type CoursePublishReadiness,
  type PublicationLessonFailure,
} from "@/lib/publication-readiness";
import { isSafePublicSourceUrl, sourcePackQualityIssues } from "@/lib/source-safety";
import { courseOutlineSchema } from "@/lib/validation";

export const PUBLICATION_ASSESSMENT_VERSION = "publication-assessment-v1";

export type PublicationIssueCategory =
  | "structure"
  | "quality"
  | "language_integrity"
  | "source_security";

export interface PublicationAssessmentIssue {
  code: string;
  category: PublicationIssueCategory;
  message: string;
  overridable: boolean;
  lessonId?: string;
}

export interface PublicationAssessment extends CoursePublishReadiness {
  assessmentVersion: typeof PUBLICATION_ASSESSMENT_VERSION;
  ready: boolean;
  overrideEligible: boolean;
  issues: PublicationAssessmentIssue[];
  overridableIssues: PublicationAssessmentIssue[];
  nonOverridableIssues: PublicationAssessmentIssue[];
  courseQualityGateVersion: string;
  lessonQualityGateVersion: string;
}

function lessonIssues(failures: PublicationLessonFailure[]): PublicationAssessmentIssue[] {
  return failures.flatMap((failure) => failure.issues.map((message, index) => ({
    code: `lesson.${failure.category}.${failure.lessonId}.${index + 1}`,
    category: failure.category,
    message,
    overridable: failure.overridable,
    lessonId: failure.lessonId,
  })));
}

export function assessCourseForPublication(
  course: Course & Record<string, unknown>,
  lessons: Array<Record<string, unknown>>,
  expectedLessonIds: string[],
  expectedModesByLessonId: Readonly<Record<string, LessonMode | undefined>> = {},
): PublicationAssessment {
  const readiness = inspectCoursePublishReadiness(
    lessons,
    expectedLessonIds,
    course.topic,
    expectedModesByLessonId,
  );
  const issues: PublicationAssessmentIssue[] = [];
  const parsedOutline = courseOutlineSchema.safeParse(course);

  if (!parsedOutline.success) {
    issues.push({
      code: "course.structure.invalid_outline",
      category: "structure",
      message: "The course outline does not match the current required structure.",
      overridable: false,
    });
  } else {
    inspectGeneratedContent(parsedOutline.data, course.topic).forEach((issue, index) => {
      issues.push({
        code: `course.language_integrity.${index + 1}`,
        category: "language_integrity",
        message: `${issue.path}: ${issue.reason}`,
        overridable: true,
      });
    });
    courseQualityIssues(parsedOutline.data).forEach((message, index) => {
      issues.push({
        code: `course.quality.${index + 1}`,
        category: "quality",
        message,
        overridable: true,
      });
    });
  }

  const unsafeSourceMessages = new Set((course.sourcePack ?? []).flatMap((source) =>
    source.url && !isSafePublicSourceUrl(source.url)
      ? [`${source.label} does not use a safe public HTTPS destination.`]
      : [],
  ));
  Array.from(unsafeSourceMessages).forEach((message, index) => {
    issues.push({
      code: `course.source_security.${index + 1}`,
      category: "source_security",
      message,
      overridable: false,
    });
  });
  sourcePackQualityIssues(course.sourcePack)
    .filter((message) => !unsafeSourceMessages.has(message))
    .forEach((message, index) => {
      issues.push({
        code: `course.source_quality.${index + 1}`,
        category: "quality",
        message,
        overridable: true,
      });
    });

  if (readiness.missingLessonIds.length) {
    issues.push({
      code: "lesson.structure.missing",
      category: "structure",
      message: `${readiness.missingLessonIds.length} ${readiness.missingLessonIds.length === 1 ? "lesson is" : "lessons are"} missing.`,
      overridable: false,
    });
  }
  issues.push(...lessonIssues(readiness.invalidLessons));

  const overridableIssues = issues.filter((issue) => issue.overridable);
  const nonOverridableIssues = issues.filter((issue) => !issue.overridable);

  return {
    ...readiness,
    assessmentVersion: PUBLICATION_ASSESSMENT_VERSION,
    ready: issues.length === 0,
    overrideEligible: nonOverridableIssues.length === 0 && overridableIssues.length > 0,
    issues,
    overridableIssues,
    nonOverridableIssues,
    courseQualityGateVersion: COURSE_QUALITY_GATE_VERSION,
    lessonQualityGateVersion: LESSON_QUALITY_GATE_VERSION,
  };
}
