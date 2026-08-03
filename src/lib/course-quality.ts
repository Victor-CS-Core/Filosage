import type { Course, CourseModule, LessonMode, LessonSummary } from "@/lib/course-types";

export const COURSE_QUALITY_GATE_VERSION = "guided-apprenticeship-v1";

type CourseOutline = Pick<Course, "artifact" | "capstone" | "modules" | "outcome">;

const GENERIC_VERBS = /^(?:understand|learn|explore|know|be familiar with|gain awareness of)\b/i;
const STOP_WORDS = new Set(["about", "after", "again", "against", "being", "course", "final", "from", "into", "that", "their", "there", "these", "this", "through", "using", "with", "your"]);

function normalized(value: string | undefined) {
  return (value ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function contentWords(value: string | undefined) {
  return new Set(normalized(value).split(" ").filter((word) => word.length >= 5 && !STOP_WORDS.has(word)));
}

function textSimilarity(left: string, right: string) {
  const leftWords = new Set(left.split(" ").filter((word) => word.length > 3));
  const rightWords = new Set(right.split(" ").filter((word) => word.length > 3));
  if (leftWords.size < 4 || rightWords.size < 4) return 0;
  const overlap = [...leftWords].filter((word) => rightWords.has(word)).length;
  return overlap / Math.max(leftWords.size, rightWords.size);
}

function duplicateValues(values: Array<{ label: string; value: string | undefined }>, noun: string, detectNearDuplicates = false) {
  const previousValues: Array<{ label: string; value: string }> = [];
  const issues: string[] = [];
  for (const item of values) {
    const key = normalized(item.value);
    if (!key) continue;
    const first = previousValues.find((previous) => previous.value === key);
    const near = detectNearDuplicates
      ? previousValues.find((previous) => textSimilarity(previous.value, key) >= 0.8)
      : undefined;
    if (first) issues.push(`${noun} for ${item.label} duplicates ${first.label}.`);
    else if (near) issues.push(`${noun} for ${item.label} is too similar to ${near.label}.`);
    previousValues.push({ label: item.label, value: key });
  }
  return issues;
}

function flattenedLessons(modules: CourseModule[]) {
  return modules.flatMap((courseModule, moduleIndex) => courseModule.lessons.map((lesson, lessonIndex) => ({
    lesson,
    label: `lesson ${moduleIndex + 1}.${lessonIndex + 1}`,
  })));
}

function modeIssues(lessons: Array<{ lesson: LessonSummary; label: string }>) {
  const modes = lessons.flatMap(({ lesson }) => lesson.lessonMode ? [lesson.lessonMode] : []);
  const issues: string[] = [];
  if (lessons.length >= 4 && new Set(modes).size < 3) {
    issues.push("The course needs at least three distinct teaching modes.");
  }
  let runMode: LessonMode | undefined;
  let runLength = 0;
  for (const mode of modes) {
    if (mode === runMode) runLength += 1;
    else { runMode = mode; runLength = 1; }
    if (runLength === 3) issues.push(`The ${mode} teaching mode repeats three times in sequence.`);
  }
  return issues;
}

export function courseQualityIssues(course: CourseOutline) {
  const issues: string[] = [];
  const lessons = flattenedLessons(course.modules);
  issues.push(...duplicateValues(lessons.map(({ lesson, label }) => ({ label, value: lesson.title })), "The title"));
  issues.push(...duplicateValues(lessons.map(({ lesson, label }) => ({ label, value: lesson.activityPreview })), "The activity", true));
  issues.push(...duplicateValues(lessons.map(({ lesson, label }) => ({ label, value: lesson.artifactContribution })), "The artifact contribution", true));
  issues.push(...duplicateValues(course.modules.map((module, index) => ({ label: `module ${index + 1}`, value: module.milestone?.deliverable })), "The milestone deliverable", true));
  issues.push(...duplicateValues(course.modules.map((module, index) => ({ label: `module ${index + 1}`, value: module.challenge?.prompt })), "The module challenge", true));
  issues.push(...modeIssues(lessons));

  for (const { lesson, label } of lessons) {
    if (GENERIC_VERBS.test(lesson.objective ?? "")) issues.push(`The objective for ${label} must use an observable action.`);
    if (GENERIC_VERBS.test(lesson.masteryCriteria ?? "")) issues.push(`The mastery criterion for ${label} must describe observable evidence.`);
  }
  const earlierTitles = new Set<string>();
  for (const { lesson, label } of lessons) {
    for (const prerequisite of lesson.buildsOn ?? []) {
      if (!earlierTitles.has(normalized(prerequisite))) {
        issues.push(`The prerequisite named by ${label} must match an earlier lesson title.`);
      }
    }
    earlierTitles.add(normalized(lesson.title));
  }
  for (const [index, module] of course.modules.entries()) {
    if (module.milestone && normalized(module.milestone.deliverable) === normalized(module.milestone.evidence)) {
      issues.push(`Module ${index + 1} must distinguish its deliverable from the evidence used to judge it.`);
    }
  }

  if (course.artifact && course.capstone) {
    const artifactWords = contentWords(`${course.artifact.title} ${course.artifact.description} ${course.artifact.format}`);
    const capstoneWords = contentWords(`${course.capstone.title} ${course.capstone.brief} ${course.capstone.deliverable}`);
    if (![...artifactWords].some((word) => capstoneWords.has(word))) {
      issues.push("The capstone deliverable must clearly align with the named course artifact.");
    }
  }
  if (course.capstone) {
    issues.push(...duplicateValues(course.capstone.successCriteria.map((value, index) => ({ label: `capstone criterion ${index + 1}`, value })), "The success criterion"));
  }
  return Array.from(new Set(issues));
}
