import type { LessonData } from "@/lib/course-types";
import { inspectGeneratedContent } from "@/lib/content-language";
import { hasBlockMarkdownSyntax, hasCollapsedMarkdownTable } from "@/lib/markdown";

export const LESSON_QUALITY_GATE_VERSION = "didactic-v5-publication";

export function lessonQualityIssues(lesson: LessonData | null, topic: string) {
  if (!lesson) return ["No structured lesson was returned."];
  const issues: string[] = [];
  if (lesson.content.trim().length < 1_500) issues.push("The explanation is too shallow.");
  if (!lesson.learningObjective?.trim()) issues.push("The observable learning objective is missing.");
  if (!lesson.connection?.trim()) issues.push("The curricular connection is missing.");
  if ((lesson.keyTakeaways?.length ?? 0) < 3) issues.push("At least three concrete takeaways are required.");
  if ((lesson.guidedPractice?.steps.length ?? 0) < 2) issues.push("Guided practice needs at least two reasoning steps.");
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
  if ((lesson.transferTask?.successCriteria.length ?? 0) < 2) {
    issues.push("The transfer task needs measurable success criteria.");
  }
  if (/```(?:mermaid|dot|graphviz)\b|^\s*(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b/im.test(lesson.content)) {
    issues.push("Remove all diagram and graph syntax; teach the relationships in prose.");
  }
  if (lesson.quizzes.length < 2) issues.push("At least two application-focused checks are required.");
  if (lesson.quizzes.some((quiz) => quiz.options.length !== 4 || quiz.optionFeedback?.length !== 4)) {
    issues.push("Every quiz option needs corresponding feedback.");
  }
  issues.push(...inspectGeneratedContent(lesson, topic).map((issue) =>
    `${issue.path} ${issue.reason}.`,
  ));
  return issues;
}
