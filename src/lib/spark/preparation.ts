import "server-only";

import { createHash } from "node:crypto";
import type { ServerAccount } from "@/lib/account-server";
import {
  getStoredDocument,
  runStoredDocumentTransaction,
  type StoredDocument,
} from "@/lib/document-store";
import {
  SPARK_REGISTRY_VERSION,
  SPARK_SCHEMA_VERSION,
  safeSparkManifest,
  sparkManifestSchema,
  type SparkBlock,
  type SparkManifest,
} from "@/lib/spark/contracts";
import {
  requireSparkLessonAccess,
  sparkSafeId,
  type SparkLessonContext,
} from "@/lib/spark/access";
import type { SparkTaskRecord } from "@/lib/spark/registry";
import { sparkPreparationAdmissionEnabled } from "@/lib/spark/budget";

const TARGET_CHUNK_WORDS = 450;
const MAXIMUM_CHUNK_WORDS = 600;
const MAXIMUM_CHUNKS = 16;

const LOCALE_ALIASES: Record<string, string> = {
  english: "en",
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  portuguese: "pt",
};

export function normalizeSparkLocale(value: string) {
  const normalized = value.trim().toLowerCase();
  if (LOCALE_ALIASES[normalized]) return LOCALE_ALIASES[normalized];
  const primary = normalized.split("-")[0];
  return /^[a-z]{2,3}$/.test(primary) ? primary : "en";
}

export interface SparkChunk {
  id: string;
  courseId: string;
  lessonId: string;
  lessonVersion: string;
  contentHash: string;
  ordinal: number;
  text: string;
  lexicalTerms: string[];
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function terms(value: string) {
  return Array.from(new Set(
    value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [],
  )).slice(0, 200);
}

export function chunkSparkLesson(context: Pick<SparkLessonContext, "courseId" | "lessonId" | "lessonVersion" | "contentHash" | "lesson">) {
  const paragraphs = context.lesson.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const groups: string[] = [];
  let pending: string[] = [];
  let pendingWords = 0;
  for (const paragraph of paragraphs) {
    const paragraphWords = paragraph.split(/\s+/).length;
    if (pending.length && pendingWords + paragraphWords > MAXIMUM_CHUNK_WORDS) {
      groups.push(pending.join("\n\n"));
      pending = [];
      pendingWords = 0;
    }
    pending.push(paragraph);
    pendingWords += paragraphWords;
    if (pendingWords >= TARGET_CHUNK_WORDS) {
      groups.push(pending.join("\n\n"));
      pending = [];
      pendingWords = 0;
    }
  }
  if (pending.length) groups.push(pending.join("\n\n"));
  if (!groups.length) groups.push(context.lesson.content.trim() || "Saved lesson content is unavailable.");
  return groups.slice(0, MAXIMUM_CHUNKS).map((text, ordinal): SparkChunk => ({
    id: `chunk-${hash(`${context.lessonVersion}:${ordinal}:${text}`).slice(0, 24)}`,
    courseId: context.courseId,
    lessonId: context.lessonId,
    lessonVersion: context.lessonVersion,
    contentHash: hash(text),
    ordinal,
    text: text.slice(0, 12_000),
    lexicalTerms: terms(text),
  }));
}

function objectiveIds(context: SparkLessonContext) {
  const raw = context.lesson.objectiveIds?.length
    ? context.lesson.objectiveIds
    : [context.summary.objectiveId ?? `objective-${context.lessonId}`];
  return raw.slice(0, 8).map((value, index) => sparkSafeId(value, `objective-${index + 1}`));
}

function explorerFor(context: SparkLessonContext, sources: string[], objectives: string[]): SparkBlock | null {
  const subject = `${context.course.topic} ${context.summary.title} ${context.summary.concept}`.toLowerCase();
  const shared = {
    id: "concept-explorer",
    type: "parameter_explorer" as const,
    title: "Explore the relationship",
    prompt: "Change one value at a time and explain what changes in the output.",
    sourceRefs: sources,
    objectiveIds: objectives,
    evidenceStatus: "course_supported" as const,
  };
  if (/neuron|neural|sigmoid|machine learning/.test(subject)) {
    return { ...shared, template: "neuron-v1", config: {
      x1: 3, x2: 7, weight1: 0.8, weight2: 0.2, bias: -4,
      x1Label: "Input 1", x2Label: "Input 2", minimum: -10, maximum: 10, step: 0.1,
    } };
  }
  if (/linear|slope|intercept|function/.test(subject)) {
    return { ...shared, template: "linear-v1", config: {
      x: 2, slope: 1.5, intercept: 1, xLabel: "x", yLabel: "y", minimum: -10, maximum: 10, step: 0.5,
    } };
  }
  if (/compound|growth|interest|exponential/.test(subject)) {
    return { ...shared, template: "compound-growth-v1", config: {
      principal: 100, ratePercent: 5, periods: 10, contribution: 0, currencyLabel: "units",
      disclaimer: "Illustrative math activity, not financial advice.",
    } };
  }
  return null;
}

export function buildSparkPreparation(context: SparkLessonContext, locale: string, createdAt = new Date().toISOString()) {
  locale = normalizeSparkLocale(locale);
  const chunks = chunkSparkLesson(context);
  const objectives = objectiveIds(context);
  const sourceRefs = chunks.slice(0, 4).map((chunk) => chunk.id);
  const blocks: SparkBlock[] = [{
    id: "lesson-focus",
    type: "explanation",
    title: context.summary.title,
    text: context.lesson.content.slice(0, 4_000),
    style: "concise",
    steps: context.lesson.keyTakeaways?.slice(0, 8).map((item) => item.slice(0, 500)),
    sourceRefs,
    objectiveIds: objectives,
    evidenceStatus: "course_supported",
  }];
  const taskRecords: SparkTaskRecord[] = [];
  const quiz = context.lesson.quizzes[0];
  if (quiz?.options.length && quiz.options[quiz.correctIndex]) {
    const taskId = "lesson-check-1";
    const taskVersion = `task-${hash(JSON.stringify({ lessonVersion: context.lessonVersion, quiz })).slice(0, 24)}`;
    const options = quiz.options.slice(0, 6).map((option, index) => ({ id: `option-${index + 1}`, text: option.slice(0, 500) }));
    blocks.push({
      id: "practice-check-1",
      type: "single_choice",
      taskId,
      taskVersion,
      prompt: quiz.question.slice(0, 4_000),
      options,
      sourceRefs,
      objectiveIds: objectives,
      evidenceStatus: "course_supported",
    });
    taskRecords.push({
      courseId: context.courseId,
      lessonId: context.lessonId,
      lessonVersion: context.lessonVersion,
      taskId,
      taskVersion,
      objectiveIds: objectives,
      kind: "choice",
      correctOptionIds: [options[quiz.correctIndex]?.id ?? "option-1"],
      feedback: quiz.explanation.slice(0, 4_000),
    });
  }
  const explorer = explorerFor(context, sourceRefs, objectives);
  if (explorer) blocks.push(explorer);
  if (context.lesson.transferTask) {
    const taskVersion = `task-${hash(`${context.lessonVersion}:transfer`).slice(0, 24)}`;
    blocks.push({
      id: "transfer-checkpoint",
      type: "short_response",
      taskId: "transfer-checkpoint",
      taskVersion,
      prompt: context.lesson.transferTask.prompt.slice(0, 4_000),
      minimumCharacters: 20,
      maximumCharacters: 4_000,
      grading: "ai_rubric",
      sourceRefs,
      objectiveIds: objectives,
      evidenceStatus: "course_supported",
    });
    taskRecords.push({
      courseId: context.courseId,
      lessonId: context.lessonId,
      lessonVersion: context.lessonVersion,
      taskId: "transfer-checkpoint",
      taskVersion,
      objectiveIds: objectives,
      kind: "text",
      rubricVersion: `rubric-${hash(JSON.stringify(context.lesson.transferTask.successCriteria)).slice(0, 24)}`,
      criteria: context.lesson.transferTask.successCriteria.slice(0, 8).map((criterion) => criterion.slice(0, 500)),
      grading: "ai_rubric",
    });
  }
  const id = `manifest-${hash(`${context.courseId}:${context.lessonId}:${context.lessonVersion}:${locale}:${SPARK_REGISTRY_VERSION}`).slice(0, 24)}`;
  const manifest = sparkManifestSchema.parse({
    schemaVersion: SPARK_SCHEMA_VERSION,
    registryVersion: SPARK_REGISTRY_VERSION,
    id,
    courseId: context.courseId,
    lessonId: context.lessonId,
    lessonVersion: context.lessonVersion,
    locale,
    stage: "define",
    objectiveIds: objectives,
    contentHash: context.contentHash,
    evidenceStatus: "course_supported",
    blocks: blocks.slice(0, 8),
    createdAt,
  });
  return { manifest, chunks, taskRecords };
}

export function sparkManifestId(context: Pick<SparkLessonContext, "courseId" | "lessonId" | "lessonVersion">, locale: string) {
  locale = normalizeSparkLocale(locale);
  return `manifest-${hash(`${context.courseId}:${context.lessonId}:${context.lessonVersion}:${locale}:${SPARK_REGISTRY_VERSION}`).slice(0, 24)}`;
}

export async function readSparkManifest(context: SparkLessonContext, locale: string) {
  const saved = await getStoredDocument(`sparkManifests/${sparkManifestId(context, locale)}`);
  const parsed = safeSparkManifest(saved);
  return parsed.success && parsed.data.contentHash === context.contentHash ? parsed.data : null;
}

export async function prepareSparkLesson(
  account: Pick<ServerAccount, "uid" | "isOwner">,
  courseId: string,
  lessonId: string,
  locale: string,
) {
  locale = normalizeSparkLocale(locale);
  if (!await sparkPreparationAdmissionEnabled()) throw new Error("SPARK_PREPARATION_DISABLED");
  const context = await requireSparkLessonAccess(account, courseId, lessonId);
  if (context.course.authorId !== account.uid && !account.isOwner) {
    throw new Error("SPARK_PREPARATION_FORBIDDEN");
  }
  const draft = buildSparkPreparation(context, locale);
  const manifestPath = `sparkManifests/${draft.manifest.id}`;
  const jobId = `prepare-${hash(`${draft.manifest.id}:${context.contentHash}`).slice(0, 24)}`;
  const jobPath = `sparkPreparationJobs/${jobId}`;
  const chunkWrites = draft.chunks.map((chunk) => ({ path: `sparkChunks/${chunk.id}`, data: {
    ...chunk,
    ownerUid: context.course.authorId ?? account.uid,
    createdAt: draft.manifest.createdAt,
  } }));
  const taskWrites = draft.taskRecords.map((task) => ({ path: `sparkTasks/${task.taskVersion}`, data: {
    ...task,
    ownerUid: context.course.authorId ?? account.uid,
    createdAt: draft.manifest.createdAt,
  } }));
  const paths = [manifestPath, jobPath, ...chunkWrites.map((write) => write.path), ...taskWrites.map((write) => write.path)];
  return runStoredDocumentTransaction(paths, (documents) => {
    const current = safeSparkManifest(documents[manifestPath]);
    if (current.success && current.data.contentHash === context.contentHash) {
      return { writes: [], result: { manifest: current.data, prepared: false, jobId } };
    }
    const createdAt = typeof documents[jobPath]?.createdAt === "string"
      ? String(documents[jobPath]?.createdAt)
      : draft.manifest.createdAt;
    const manifest: SparkManifest = { ...draft.manifest, createdAt };
    return {
      writes: [
        { path: manifestPath, data: manifest },
        ...chunkWrites,
        ...taskWrites,
        { path: jobPath, data: {
          ownerUid: context.course.authorId ?? account.uid,
          courseId,
          lessonId,
          lessonVersion: context.lessonVersion,
          contentHash: context.contentHash,
          manifestId: manifest.id,
          state: "ready",
          attempts: 1,
          createdAt,
          updatedAt: draft.manifest.createdAt,
        } },
      ],
      result: { manifest, prepared: true, jobId },
    };
  });
}

export function sparkManifestFromDocument(value: StoredDocument | null) {
  const parsed = safeSparkManifest(value);
  return parsed.success ? parsed.data : null;
}