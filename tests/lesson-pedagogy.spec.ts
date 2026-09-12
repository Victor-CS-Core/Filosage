import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import type { LessonData, Quiz } from "../src/lib/course-types";
import { lessonQualityIssues, quizAnswerCueIssues } from "../src/lib/lesson-quality";
import { curateLessonInteractions, deriveLessonInteractions } from "../src/lib/lesson-interactions";

const diagramIssue = "Remove all diagram and graph syntax; teach the relationships in prose.";

for (const lessonKind of ["substantive", "introduction"] as const) {
  test(`${lessonKind} diagram checks preserve fences, indentation, and line boundaries`, () => {
    const cases: Array<[string, boolean]> = [
      ["```mermaid\nflowchart LR", true],
      ["```dot\ndigraph Example {}", true],
      ["```graphviz\ndigraph Example {}", true],
      ["\t\u00a0Flowchart LR", true],
      ["\n\n  graph TD", true],
      ["\r  graph BT", true],
      ["\r\n  graph RL", true],
      ["\u2028  graph TB", true],
      ["\u2029  graph LR", true],
      ["flowchart\nLR", true],
      ["Explain the flowchart LR notation in prose.", false],
      ["graph THEORY", false],
      ["flowchart LRX", false],
      ["```mermaidx", false],
      ["\n\nPlain explanation.", false],
    ];
    for (const [content, expected] of cases) {
      const issues = lessonQualityIssues({ content, quizzes: [], lessonKind }, "Diagrams");
      expect(issues.includes(diagramIssue), JSON.stringify(content)).toBe(expected);
    }
  });

  test(`${lessonKind} quality gate finishes on many blank lines`, () => {
    // A separate process gives the real quality gate a generous deadline while
    // keeping a backtracking regression from hanging the test worker.
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
      import { lessonQualityIssues } from './src/lib/lesson-quality.ts';
      const issues = lessonQualityIssues({
        content: '\\n'.repeat(250_000) + '!', quizzes: [], lessonKind: ${JSON.stringify(lessonKind)},
      }, 'Diagrams');
      console.log(JSON.stringify(issues));
    `], { encoding: "utf8", timeout: 5_000, windowsHide: true });
    expect(result.error, "The quality gate must complete within the child-process deadline.").toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).not.toContain(diagramIssue);
  });
}

function quiz(options: string[], correctIndex = 0): Quiz {
  return {
    question: "Which response best preserves the stated evidence?",
    options,
    correctIndex,
    explanation: "Compare each response with the evidence supplied in the lesson.",
    optionFeedback: options.map(() => "Compare this response with the supplied evidence."),
  };
}

test("diagram detection preserves whitespace semantics without rescanning preceding blank lines", () => {
  const warning = "Remove all diagram and graph syntax; teach the relationships in prose.";
  for (const lessonKind of ["substantive", "introduction"] as const) {
    const check = (content: string) => lessonQualityIssues({ content, quizzes: [] } as unknown as LessonData, "Evidence", undefined, { lessonKind });
    for (const content of ["```mermaid", "```dot", "```graphviz", "  flowchart LR", "\tGRAPH\r\nTD", "\u00a0graph\u2028BT", "\u2029\u2003flowchart RL"]) {
      expect(check(content), `${lessonKind}: ${JSON.stringify(content)}`).toContain(warning);
    }
    for (const content of ["Describe the graph LR in prose.", "graph LABEL", "flowchart LRX", "The equation compares α with β."]) {
      expect(check(content)).not.toContain(warning);
    }
    const prefix = "Intro\r\n" + "\n".repeat(2_000);
    const input = `${prefix}\tflowchart LR`;
    const nativeTest = RegExp.prototype.test;
    let diagramMatch: RegExpExecArray | null = null;
    let diagramChecks = 0;
    try {
      RegExp.prototype.test = function (value: string) {
        if (this.source.includes("mermaid|dot|graphviz")) {
          diagramChecks += 1;
          diagramMatch = new RegExp(this.source, this.flags).exec(value);
        }
        return nativeTest.call(this, value);
      };
      expect(check(input)).toContain(warning);
    } finally {
      RegExp.prototype.test = nativeTest;
    }
    expect(diagramChecks).toBe(1);
    expect(diagramMatch).toMatchObject({ index: prefix.length, 0: "\tflowchart LR" });
    expect(check(`${prefix}End.`)).not.toContain(warning);
  }
});

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
