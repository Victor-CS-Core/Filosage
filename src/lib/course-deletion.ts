export interface CourseReferenceCleanup {
  changed: boolean;
  value: Record<string, unknown>;
}

export const COURSE_DELETION_COLLECTION_GROUP_INDEXES = [
  { collectionGroup: "courseProgress", fieldPath: "courseId" },
  { collectionGroup: "learningOutcomes", fieldPath: "courseId" },
  { collectionGroup: "masteryEvidence", fieldPath: "courseId" },
  { collectionGroup: "contentReports", fieldPath: "courseId" },
  { collectionGroup: "outcomeFeedback", fieldPath: "courseId" },
  { collectionGroup: "courseReleases", fieldPath: "courseId" },
  { collectionGroup: "lessons", fieldPath: "courseId" },
  { collectionGroup: "courseRepairs", fieldPath: "courseId" },
  { collectionGroup: "coursePipelineEvents", fieldPath: "courseId" },
  { collectionGroup: "courseManualReviewMutations", fieldPath: "courseId" },
  { collectionGroup: "lessonInteraction", fieldPath: "courseId" },
  { collectionGroup: "lessonInteractionMutations", fieldPath: "courseId" },
  { collectionGroup: "flashcardDecks", fieldPath: "courseId" },
  { collectionGroup: "flashcards", fieldPath: "courseId" },
  { collectionGroup: "flashcardReviewState", fieldPath: "courseId" },
  { collectionGroup: "lessonNotes", fieldPath: "key" },
] as const;

export const COURSE_SCOPED_COLLECTION_GROUPS = {
  progress: "courseProgress",
  learningOutcomes: "learningOutcomes",
  masteryEvidence: "masteryEvidence",
  contentReports: "contentReports",
  outcomeFeedback: "outcomeFeedback",
  releases: "courseReleases",
  releasedLessons: "lessons",
  repairs: "courseRepairs",
  pipelineEvents: "coursePipelineEvents",
  manualReviewMutations: "courseManualReviewMutations",
  lessonInteractions: "lessonInteraction",
  lessonInteractionMutations: "lessonInteractionMutations",
  flashcardDecks: "flashcardDecks",
  flashcards: "flashcards",
  flashcardReviewState: "flashcardReviewState",
} as const;

function removePrefixedKeys(value: unknown, prefix: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { changed: false, value };
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const kept = entries.filter(([key]) => !key.startsWith(prefix));
  return {
    changed: kept.length !== entries.length,
    value: Object.fromEntries(kept),
  };
}

export function removeCourseReferences(
  value: Record<string, unknown>,
  courseId: string,
): CourseReferenceCleanup {
  const prefix = `${courseId}:`;
  const next = { ...value };
  let changed = false;

  if (Array.isArray(value.courseBookmarks)) {
    const courseBookmarks = value.courseBookmarks.filter((item) => String(item) !== courseId);
    changed ||= courseBookmarks.length !== value.courseBookmarks.length;
    next.courseBookmarks = courseBookmarks;
  }

  if (Array.isArray(value.lessonBookmarks)) {
    const lessonBookmarks = value.lessonBookmarks.filter((item) => !String(item).startsWith(prefix));
    changed ||= lessonBookmarks.length !== value.lessonBookmarks.length;
    next.lessonBookmarks = lessonBookmarks;
  }

  const notes = removePrefixedKeys(value.notes, prefix);
  if (notes.changed) {
    changed = true;
    next.notes = notes.value;
  }

  const noteUpdatedAt = removePrefixedKeys(value.noteUpdatedAt, prefix);
  if (noteUpdatedAt.changed) {
    changed = true;
    next.noteUpdatedAt = noteUpdatedAt.value;
  }

  return { changed, value: next };
}
