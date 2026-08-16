import { expect, test } from "@playwright/test";
import type { Quiz } from "../src/lib/course-types";
import { quizAnswerCueIssues } from "../src/lib/lesson-quality";

function quiz(options: string[], correctIndex = 0): Quiz {
  return {
    question: "Which response best preserves the stated evidence?",
    options,
    correctIndex,
    explanation: "Compare each response with the evidence supplied in the lesson.",
    optionFeedback: options.map(() => "Compare this response with the supplied evidence."),
  };
}

test("accepts natural variation in parallel quiz options", () => {
  expect(quizAnswerCueIssues([quiz([
    "Classify the observation before choosing an action.",
    "Choose an action before checking the observation.",
    "Treat the observation as proof of a cause.",
    "Ignore the observation and follow the prior plan.",
  ])])).toEqual([]);
});

test("rejects a correct option that is conspicuously more developed than every distractor", () => {
  expect(quizAnswerCueIssues([quiz([
    "Classify the recorded observation first, separate it from any causal interpretation, and then choose a bounded next action.",
    "Move quickly.",
    "Trust intuition.",
    "Wait longer.",
  ])])).toContain("Quiz 1 reveals the correct answer through a conspicuous length difference.");
});

test("rejects a correct fragment surrounded by fully developed distractors", () => {
  expect(quizAnswerCueIssues([quiz([
    "Check it.",
    "Classify the available observation and document why the chosen action follows from it.",
    "Compare each competing explanation and record the evidence that would distinguish them.",
    "Describe the uncertainty and choose a reversible response with an explicit boundary.",
  ])])).toContain("Quiz 1 reveals the correct answer through a conspicuous length difference.");
});

test("evaluates the declared correct option rather than assuming the first position", () => {
  expect(quizAnswerCueIssues([quiz([
    "Move quickly.",
    "Trust intuition.",
    "Classify the recorded observation first, separate it from any causal interpretation, and then choose a bounded next action.",
    "Wait longer.",
  ], 2)])).toContain("Quiz 1 reveals the correct answer through a conspicuous length difference.");
});
