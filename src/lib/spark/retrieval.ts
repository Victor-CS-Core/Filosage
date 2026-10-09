import "server-only";

import { listStoredDocumentsByField } from "@/lib/document-store";
import type { SparkLessonContext } from "@/lib/spark/access";
import type { SparkChunk } from "@/lib/spark/preparation";

function queryTerms(value: string) {
  return new Set(value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
}

function chunkValue(value: Record<string, unknown>): SparkChunk | null {
  if (typeof value.id !== "string" || typeof value.courseId !== "string"
    || typeof value.lessonId !== "string" || typeof value.lessonVersion !== "string"
    || typeof value.contentHash !== "string" || typeof value.text !== "string"
    || !Array.isArray(value.lexicalTerms) || !value.lexicalTerms.every((term) => typeof term === "string")) return null;
  return value as unknown as SparkChunk;
}

export async function retrieveSparkChunks(
  context: SparkLessonContext,
  query: string,
  maximum = 4,
) {
  const records = await listStoredDocumentsByField("sparkChunks", "lessonVersion", context.lessonVersion, 100);
  const candidates = records.flatMap((record) => {
    const chunk = chunkValue(record);
    return chunk
      && chunk.courseId === context.courseId
      && chunk.lessonId === context.lessonId
      && chunk.lessonVersion === context.lessonVersion
      ? [chunk]
      : [];
  });
  const requestedTerms = queryTerms(query);
  return candidates
    .map((chunk) => ({
      chunk,
      score: chunk.lexicalTerms.reduce((total, term) => total + Number(requestedTerms.has(term)), 0),
    }))
    .sort((left, right) => right.score - left.score || left.chunk.ordinal - right.chunk.ordinal)
    .slice(0, Math.min(4, Math.max(1, maximum)))
    .map(({ chunk }) => chunk);
}