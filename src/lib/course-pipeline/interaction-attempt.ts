export interface InteractionAttemptMetadata {
  courseId: string;
  lessonId: string;
  interactionId: string;
  itemId: string;
  artifactHash: string;
  payloadHash: string;
  correct: boolean;
  now: number;
}

function integerValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

export function buildInteractionAttemptMutation(
  documents: Record<string, Record<string, unknown> | null>,
  progressPath: string,
  mutationPath: string,
  metadata: InteractionAttemptMetadata,
) {
  const priorMutation = documents[mutationPath];
  if (priorMutation) {
    if (priorMutation.payloadHash !== metadata.payloadHash) throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
    return {
      writes: [],
      result: {
        correct: priorMutation.correct === true,
        attempts: integerValue(priorMutation.attempts),
        firstAttemptCorrect: priorMutation.firstAttemptCorrect === true,
        recovered: true,
      },
    };
  }

  const previous = documents[progressPath];
  const attempts = Math.min(20, integerValue(previous?.attempts) + 1);
  const firstAttemptCorrect = previous?.firstAttemptCorrect === true || (attempts === 1 && metadata.correct);
  return {
    writes: [
      {
        path: progressPath,
        data: {
          courseId: metadata.courseId,
          lessonId: metadata.lessonId,
          interactionId: metadata.interactionId,
          itemId: metadata.itemId,
          artifactHash: metadata.artifactHash,
          attempts,
          firstAttemptCorrect,
          mastered: previous?.mastered === true || metadata.correct,
          lastAttemptAt: new Date(metadata.now).toISOString(),
        },
      },
      {
        path: mutationPath,
        data: {
          courseId: metadata.courseId,
          lessonId: metadata.lessonId,
          interactionId: metadata.interactionId,
          itemId: metadata.itemId,
          artifactHash: metadata.artifactHash,
          payloadHash: metadata.payloadHash,
          correct: metadata.correct,
          attempts,
          firstAttemptCorrect,
          createdAt: new Date(metadata.now).toISOString(),
          expiresAt: new Date(metadata.now + 30 * 24 * 60 * 60 * 1_000),
        },
      },
    ],
    result: { correct: metadata.correct, attempts, firstAttemptCorrect, recovered: false },
  };
}
