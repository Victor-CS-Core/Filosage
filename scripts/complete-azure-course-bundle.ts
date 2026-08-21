import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  fromDocumentFields,
  toDocumentFields,
  type DocumentValue,
} from "../src/lib/document-values.ts";
import { publicationContentFingerprint } from "../src/lib/publication-content.ts";

interface MigrationBundle {
  schemaVersion: 1 | 2;
  exportedAt: string;
  sourceProjectId: string;
  owner: { uid: string; email: string };
  documents: Array<{ path: string; fields: Record<string, DocumentValue> }>;
  bannerObjects: Array<{ assetId: string; contentType: string; base64: string }>;
  releaseRecovery?: {
    strategy: "canonical-published-documents";
    completedAt: string;
    releaseDocuments: number;
  };
}

const inputArgument = process.argv.find((value) => value.startsWith("--input="))?.slice(8);
const outputArgument = process.argv.find((value) => value.startsWith("--output="))?.slice(9);
const inputPath = resolve(inputArgument || "migration-private/authored-courses.json");
const outputPath = resolve(outputArgument || "migration-private/authored-courses-complete.json");
if (inputPath === outputPath) throw new Error("Use a separate output path so the verified source bundle remains unchanged.");

const source = JSON.parse(await readFile(inputPath, "utf8")) as MigrationBundle;
if (![1, 2].includes(source.schemaVersion) || !Array.isArray(source.documents) || !Array.isArray(source.bannerObjects)) {
  throw new Error("Unsupported or invalid migration bundle.");
}
if (source.documents.some((document) => document.path.startsWith("courseReleases/"))) {
  throw new Error("The input already contains course release documents; use the original source-only bundle.");
}

const roots = new Map(
  source.documents
    .filter((document) => /^courses\/[^/]+$/.test(document.path))
    .map((document) => [document.path.split("/")[1], fromDocumentFields(document.fields)] as const),
);
const lessonsByCourse = new Map<string, Array<{ lessonId: string; data: Record<string, unknown> }>>();
for (const document of source.documents.filter((item) => /^courses\/[^/]+\/lessons\/[^/]+$/.test(item.path))) {
  const [, courseId, , lessonId] = document.path.split("/");
  const lessons = lessonsByCourse.get(courseId) ?? [];
  lessons.push({ lessonId, data: fromDocumentFields(document.fields) });
  lessonsByCourse.set(courseId, lessons);
}

const releaseDocuments: MigrationBundle["documents"] = [];
for (const [courseId, course] of roots) {
  if (course.isPublic !== true) continue;
  const releaseId = typeof course.publishedReleaseId === "string" ? course.publishedReleaseId.trim() : "";
  const publishedAt = typeof course.publishedAt === "string" ? course.publishedAt : "";
  if (!releaseId || !publishedAt) throw new Error(`Published course ${courseId} is missing immutable release metadata.`);
  const review = course.publicationReview && typeof course.publicationReview === "object"
    ? course.publicationReview as Record<string, unknown>
    : {};
  const lessons = (lessonsByCourse.get(courseId) ?? []).filter(({ data }) => data.isPublic === true);
  if (!lessons.length) throw new Error(`Published course ${courseId} has no published lessons.`);
  releaseDocuments.push({
    path: `courseReleases/${releaseId}`,
    fields: toDocumentFields({
      releaseId,
      courseId,
      snapshotHash: review.artifactSnapshotHash ?? null,
      qualityContractVersion: review.qualityContractVersion ?? null,
      courseFingerprint: publicationContentFingerprint(course),
      course,
      publishedBy: null,
      publishedAt,
    }),
  });
  for (const { lessonId, data: lesson } of lessons) {
    releaseDocuments.push({
      path: `courseReleases/${releaseId}/lessons/${lessonId}`,
      fields: toDocumentFields({
        releaseId,
        courseId,
        lessonId,
        sourceFingerprint: publicationContentFingerprint(lesson),
        lesson,
        publishedAt,
      }),
    });
  }
}
if (!releaseDocuments.length) throw new Error("No published release snapshots were recoverable.");
const paths = [...source.documents, ...releaseDocuments].map((document) => document.path);
if (new Set(paths).size !== paths.length) throw new Error("The completed bundle contains duplicate document paths.");

const completed: MigrationBundle = {
  ...source,
  schemaVersion: 2,
  documents: [...source.documents, ...releaseDocuments],
  releaseRecovery: {
    strategy: "canonical-published-documents",
    completedAt: new Date().toISOString(),
    releaseDocuments: releaseDocuments.length,
  },
};
await writeFile(outputPath, `${JSON.stringify(completed, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(`Completed the private bundle with ${releaseDocuments.length} create-only course release document(s).`);
console.log(`Private completed bundle written to ${outputPath}. It is gitignored; do not commit or share it.`);
