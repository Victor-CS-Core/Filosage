import "server-only";

import type OpenAI from "openai";
import type { Course, LessonData } from "@/lib/course-types";
import { assertSafeContent, MODERATION_MODEL } from "@/lib/content-safety";
import { inspectGeneratedContent } from "@/lib/content-language";
import { LESSON_QUALITY_GATE_VERSION } from "@/lib/lesson-quality";
import { inspectCoursePublishReadiness, type PublicationLessonFailure } from "@/lib/publication-readiness";
import { courseOutlineSchema, lessonDataSchema } from "@/lib/validation";
import { courseQualityIssues } from "@/lib/course-quality";
import { sourcePackQualityIssues } from "@/lib/source-safety";

export const PUBLICATION_REVIEW_VERSION = "publication-v1";

export interface PublicationLessonReview {
  lessonId: string;
  contentHash: string;
  status: "approved";
  reviewedAt: string;
  reviewedBy: string;
  reviewerRole: "author" | "owner";
  moderationModel: string;
  reviewVersion: string;
  qualityGateVersion: string;
  factualReviewStatus: "unverified";
  sourceUpdatedAt?: string;
}

export class PublicationReviewError extends Error {
  constructor(
    message: string,
    public readonly invalidLessonIds: string[] = [],
    public readonly invalidLessons: PublicationLessonFailure[] = [],
  ) {
    super(message);
    this.name = "PublicationReviewError";
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["id", "createdAt", "updatedAt", "publicationReview"].includes(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

export async function generatedContentHash(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(stableValue(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function reviewCourseForPublication(
  client: OpenAI,
  course: Course & Record<string, unknown>,
  lessons: Array<Record<string, unknown>>,
  expectedLessonIds: string[],
  reviewer: { uid: string; isOwner: boolean },
) {
  const parsedOutline = courseOutlineSchema.safeParse(course);
  if (!parsedOutline.success) {
    throw new PublicationReviewError("The course outline no longer meets the current publication standard.");
  }
  const outlineIntegrity = inspectGeneratedContent(parsedOutline.data, course.topic);
  if (outlineIntegrity.length) {
    throw new PublicationReviewError("The course outline contains language or generation artifacts that must be corrected.");
  }
  const outlineQuality = courseQualityIssues(parsedOutline.data);
  const sourceIssues = sourcePackQualityIssues(course.sourcePack);
  if (outlineQuality.length || sourceIssues.length) {
    throw new PublicationReviewError(
      `The course outline needs review before publication: ${[...outlineQuality, ...sourceIssues].slice(0, 3).join(" ")}`,
    );
  }

  const expectedModesByLessonId = Object.fromEntries(course.modules.flatMap((courseModule, moduleIndex) =>
    courseModule.lessons.map((lesson, lessonIndex) => [`${moduleIndex}-${lessonIndex}`, lesson.lessonMode]),
  ));
  const readiness = inspectCoursePublishReadiness(lessons, expectedLessonIds, course.topic, expectedModesByLessonId);
  if (readiness.missingLessonIds.length) {
    throw new PublicationReviewError("Generate every lesson before publishing.", readiness.missingLessonIds);
  }
  if (readiness.invalidLessonIds.length) {
    throw new PublicationReviewError(
      "One or more lessons must be regenerated to meet the current teaching and language standard.",
      readiness.invalidLessonIds,
      readiness.invalidLessons,
    );
  }
  const lessonsById = new Map(lessons.map((lesson) => [String(lesson.id ?? ""), lesson]));
  const parsedLessons = expectedLessonIds.flatMap((lessonId) => {
    const raw = lessonsById.get(lessonId);
    const parsed = lessonDataSchema.safeParse(raw);
    return raw && parsed.success ? [{ lessonId, raw, lesson: parsed.data as LessonData }] : [];
  });

  await assertSafeContent(client, JSON.stringify(parsedOutline.data), {
    uid: reviewer.uid,
    feature: "lesson_generation",
    stage: "output",
  });

  const reviewedAt = new Date().toISOString();
  const reviews: PublicationLessonReview[] = [];
  for (const { lessonId, raw, lesson } of parsedLessons) {
    await assertSafeContent(client, JSON.stringify(lesson), {
      uid: reviewer.uid,
      feature: "lesson_generation",
      stage: "output",
    });
    reviews.push({
      lessonId,
      contentHash: await generatedContentHash(raw),
      status: "approved",
      reviewedAt,
      reviewedBy: reviewer.uid,
      reviewerRole: reviewer.isOwner ? "owner" : "author",
      moderationModel: MODERATION_MODEL,
      reviewVersion: PUBLICATION_REVIEW_VERSION,
      qualityGateVersion: LESSON_QUALITY_GATE_VERSION,
      factualReviewStatus: "unverified",
      sourceUpdatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    });
  }

  return {
    reviewedAt,
    outlineHash: await generatedContentHash(parsedOutline.data),
    reviews,
    moderationModel: MODERATION_MODEL,
    reviewVersion: PUBLICATION_REVIEW_VERSION,
    factualReviewStatus: "unverified" as const,
    sourceUpdatedAt: typeof course.updatedAt === "string" ? course.updatedAt : undefined,
  };
}
