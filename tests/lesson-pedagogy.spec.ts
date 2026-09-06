import { expect, test } from "@playwright/test";
import type { Quiz } from "../src/lib/course-types";
import { quizAnswerCueIssues } from "../src/lib/lesson-quality";
import { curateLessonInteractions, deriveLessonInteractions } from "../src/lib/lesson-interactions";

function quiz(options: string[], correctIndex = 0): Quiz {
  return {
    question: "Which response best preserves the stated evidence?",
    options,
    correctIndex,
    explanation: "Compare each response with the evidence supplied in the lesson.",
    optionFeedback: options.map(() => "Compare this response with the supplied evidence."),
  };
}

test("sequence curation preserves authored Spanish guidance while neutralizing explicit English order giveaways", () => {
  const interaction = {
    type: "sequence", title: "Ordena las acciones", summary: "Reconstruye el procedimiento.",
    prompt: "Ordena las acciones según sus dependencias y comprueba qué necesita cada paso.",
    steps: [{ label: "Preparar", detail: "Reúne los materiales." }, { label: "Comparar", detail: "Compara los resultados." }, { label: "Comprobar", detail: "Comprueba la conclusión." }],
  };
  const curated = curateLessonInteractions([JSON.stringify(interaction)]);
  expect(curated[0].prompt).toBe(interaction.prompt);
  expect(deriveLessonInteractions({ content: "Compara los resultados.", quizzes: [], interactions: curated })[0].prompt).toBe(interaction.prompt);
  const english = curateLessonInteractions([JSON.stringify({ ...interaction, prompt: "First prepare the materials, then compare results, and finally check the conclusion." })]);
  expect(english[0].prompt).toContain("Arrange the actions into a coherent workflow.");
});

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
