import "server-only";

import type { SparkLessonContext } from "@/lib/spark/access";
import { chunkSparkLesson } from "@/lib/spark/preparation";

function queryTerms(value: string) {
  return new Set(value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
}

export function retrieveSparkChunks(
  context: SparkLessonContext,
  query: string,
  maximum = 4,
) {
  if (!context.lesson.content.trim()) return [];
  const requestedTerms = queryTerms(query);
  // The authorized saved lesson is authoritative, even if preparation never ran.
  return chunkSparkLesson(context)
    .map((chunk) => ({
      chunk,
      score: chunk.lexicalTerms.reduce((total, term) => total + Number(requestedTerms.has(term)), 0),
    }))
    .sort((left, right) => right.score - left.score || left.chunk.ordinal - right.chunk.ordinal)
    .slice(0, Math.min(4, Math.max(1, maximum)))
    .map(({ chunk }) => chunk);
}