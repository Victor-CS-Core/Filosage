export interface CourseReferenceCleanup {
  changed: boolean;
  value: Record<string, unknown>;
}

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
