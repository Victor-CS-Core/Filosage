import type { Course } from "@/lib/course-types";

export interface NextLesson {
  id: string;
  title: string;
}

export function findNextLesson(
  course: Pick<Course, "modules">,
  completedLessonIds: Iterable<string>,
): NextLesson | null {
  const completed = new Set(completedLessonIds);

  for (let moduleIndex = 0; moduleIndex < course.modules.length; moduleIndex += 1) {
    const courseModule = course.modules[moduleIndex];
    for (let lessonIndex = 0; lessonIndex < courseModule.lessons.length; lessonIndex += 1) {
      const id = `${moduleIndex}-${lessonIndex}`;
      if (!completed.has(id)) return { id, title: courseModule.lessons[lessonIndex].title };
    }
  }

  return null;
}

export function findCourseLesson(course: Pick<Course, "modules">, lessonId: string) {
  const [moduleIndex, lessonIndex] = lessonId.split("-").map(Number);
  if (!Number.isInteger(moduleIndex) || !Number.isInteger(lessonIndex)) return null;
  const lesson = course.modules[moduleIndex]?.lessons[lessonIndex];
  return lesson ? { lesson, moduleIndex, lessonIndex } : null;
}

export function expectedLessonIds(course: Pick<Course, "modules">) {
  return course.modules.flatMap((courseModule, moduleIndex) =>
    courseModule.lessons.map((_, lessonIndex) => `${moduleIndex}-${lessonIndex}`),
  );
}
