import type { LessonData, LessonKind, LessonMode, Quiz } from "@/lib/course-types";
import { inspectGeneratedContent } from "@/lib/content-language";
import { hasBlockMarkdownSyntax, hasCollapsedMarkdownTable } from "@/lib/markdown";
import { interactionQualityIssues } from "@/lib/lesson-interactions";

export const LESSON_QUALITY_GATE_VERSION = "apprenticeship-v10-capability-cycle-bindings";

// Leading indentation stays on its line; otherwise each blank line rescans the
// remaining whitespace. Direction tokens may still follow any whitespace.
const DIAGRAM_SYNTAX = /```(?:mermaid|dot|graphviz)\b|^[^\S\r\n\u2028\u2029]*(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b/im;

function optionLength(value: string) {
  return {
    characters: value.trim().replace(/\s+/g, " ").length,
    words: value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0,
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Detect only strong answer-length cues. Natural variation is desirable; the
 * gate rejects the cases where the correct option is effectively announced by
 * being a fully developed response among fragments (or the inverse).
 */
export function quizAnswerCueIssues(quizzes: Quiz[]) {
  const issues: string[] = [];
  for (const [quizIndex, quiz] of quizzes.entries()) {
    const correct = quiz.options[quiz.correctIndex];
    if (!correct || quiz.options.length !== 4) continue;
    const correctLength = optionLength(correct);
    const distractorLengths = quiz.options
      .filter((_, optionIndex) => optionIndex !== quiz.correctIndex)
      .map(optionLength);
    const medianWords = median(distractorLengths.map((length) => length.words));
    const medianCharacters = median(distractorLengths.map((length) => length.characters));
    const conspicuouslyLong = correctLength.words >= 6
      && correctLength.words >= Math.max(6, medianWords * 2.4)
      && correctLength.characters >= Math.max(36, medianCharacters * 2.2);
    const conspicuouslyShort = medianWords >= 6
      && medianWords >= Math.max(6, correctLength.words * 2.4)
      && medianCharacters >= Math.max(36, correctLength.characters * 2.2);
    if (conspicuouslyLong || conspicuouslyShort) {
      issues.push(`Quiz ${quizIndex + 1} reveals the correct answer through a conspicuous length difference.`);
    }
  }
  return issues;
}

export function lessonQualityIssues(
  lesson: LessonData | null,
  topic: string,
  expectedMode?: LessonMode,
  options: { requireInteractionV2?: boolean; lessonKind?: LessonKind; instructionLanguage?: string } = {},
) {
  if (!lesson) return ["No structured lesson was returned."];
  const issues: string[] = [];
  const lessonKind = options.lessonKind ?? lesson.lessonKind ?? "substantive";
  if (lessonKind !== "substantive") {
    if (!lesson.learningObjective?.trim()) issues.push("The observable learning objective is missing.");
    if (DIAGRAM_SYNTAX.test(lesson.content)) {
      issues.push("Remove all diagram and graph syntax; teach the relationships in prose.");
    }
    issues.push(...interactionQualityIssues(lesson, options.requireInteractionV2 === true));
    issues.push(...inspectGeneratedContent(lesson, topic, options.instructionLanguage ?? "English").map((issue) => `${issue.path} ${issue.reason}.`));
    return issues;
  }
  if (lesson.content.trim().length < 400) issues.push("The explanation is too shallow.");
  if (!lesson.learningObjective?.trim()) issues.push("The observable learning objective is missing.");
  if (!lesson.connection?.trim()) issues.push("The curricular connection is missing.");
  if ((lesson.keyTakeaways?.length ?? 0) < 2) issues.push("At least two concrete takeaways are required.");
  if ((lesson.guidedPractice?.steps.length ?? 0) < 1) issues.push("Guided practice needs a reasoning step.");
  if (lesson.guidedPractice?.steps.some(hasBlockMarkdownSyntax)) {
    issues.push("Each guided-practice step must be one concise prose paragraph without block Markdown.");
  }
  const structuredPractice = [
    lesson.guidedPractice?.prompt,
    ...(lesson.guidedPractice?.steps ?? []),
    lesson.guidedPractice?.modelAnswer,
    lesson.transferTask?.prompt,
    lesson.transferTask?.modelResponse,
  ].filter((item): item is string => Boolean(item));
  if (structuredPractice.some(hasCollapsedMarkdownTable)) {
    issues.push("Markdown tables in practice fields need a line break before the table and between every row.");
  }
  if ((lesson.transferTask?.successCriteria.length ?? 0) < 1) {
    issues.push("The transfer task needs measurable success criteria.");
  }
  if (DIAGRAM_SYNTAX.test(lesson.content)) {
    issues.push("Remove all diagram and graph syntax; teach the relationships in prose.");
  }
  if (lesson.quizzes.length < 1) issues.push("At least one application-focused check is required.");
  if (lesson.quizzes.some((quiz) => quiz.options.length !== 4 || quiz.optionFeedback?.length !== 4)) {
    issues.push("Every quiz option needs corresponding feedback.");
  }
  issues.push(...quizAnswerCueIssues(lesson.quizzes));
  if (expectedMode && !lesson.experience) {
    issues.push("The lesson is missing its mode-specific activity.");
  } else if (expectedMode && lesson.experience?.type !== expectedMode) {
    issues.push(`The activity must use the ${expectedMode} teaching mode.`);
  }
  if (lesson.experience?.type === "worked-example" && lesson.experience.steps.length < 3) {
    issues.push("The worked example needs at least three visible reasoning steps.");
  }
  if (lesson.experience?.type === "case-study" && lesson.experience.evidence.length < 3) {
    issues.push("The case study needs at least three distinct evidence items.");
  }
  if (lesson.experience?.type === "practice-lab" && lesson.experience.tasks.length < 3) {
    issues.push("The practice lab needs a real sequence of tasks.");
  }
  issues.push(...interactionQualityIssues(lesson, options.requireInteractionV2 === true));
  issues.push(...inspectGeneratedContent(lesson, topic, options.instructionLanguage ?? "English").map((issue) =>
    `${issue.path} ${issue.reason}.`,
  ));
  return issues;
}
