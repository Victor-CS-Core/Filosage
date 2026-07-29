import type { Course } from "@/lib/course-types";
import { expectedLessonIds, findCourseLesson } from "@/lib/course-progress";

export type LessonGenerationGate =
  | { allowed: true }
  | { allowed: false; requiredLessonId: string };

export function lessonGenerationGate(
  course: Pick<Course, "modules">,
  lessonId: string,
  completedLessonIds: Iterable<string>,
  isOwner: boolean,
): LessonGenerationGate {
  if (isOwner) return { allowed: true };
  if (!findCourseLesson(course, lessonId)) return { allowed: false, requiredLessonId: "0-0" };
  const lessonIds = expectedLessonIds(course);
  const currentPosition = lessonIds.indexOf(lessonId);
  if (currentPosition <= 0) return { allowed: true };
  const completed = new Set(completedLessonIds);
  const requiredLessonId = lessonIds.slice(0, currentPosition).find((id) => !completed.has(id));
  return requiredLessonId ? { allowed: false, requiredLessonId } : { allowed: true };
}
