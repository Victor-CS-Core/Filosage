import "server-only";

import OpenAI from "openai";
import { isLocalMode } from "@/lib/local-mode";

/**
 * Returns a real OpenAI client whenever an API key is configured. In local
 * mode without a key it returns a stub with the same call surface the app
 * uses, producing deterministic content that satisfies the real Zod schemas
 * and the lesson quality gate — so every AI feature is exercisable offline.
 */
export function aiClient(): OpenAI {
  if (process.env.OPENAI_API_KEY || !isLocalMode()) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return localAiStub() as unknown as OpenAI;
}

function line(input: string, prefix: string) {
  const match = input.split("\n").find((candidate) => candidate.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function paragraph(sentence: string, repeat: number) {
  return Array.from({ length: repeat }, () => sentence).join(" ");
}

function stubOutline(input: string) {
  const topic = line(input, "Create a complete but efficient course outline for: ") || "Your topic";
  const lesson = (title: string, concept: string, misconception: string, mode: string, practice: string) => ({
    title,
    concept,
    estimatedMinutes: 10,
    objective: `Explain and apply ${concept.toLowerCase()} in a concrete situation.`,
    lessonMode: mode,
    buildsOn: [],
    misconception,
    practiceType: practice,
    masteryCriteria: `Apply ${concept.toLowerCase()} to a new example without prompting.`,
  });
  return {
    mission: `Build a working understanding of ${topic} you can apply immediately.`,
    level: "Foundations",
    estimatedMinutes: 240,
    outcome: `Explain the core ideas of ${topic} and apply them to a realistic situation.`,
    prerequisites: [],
    category: "Local test course",
    modules: [
      {
        title: `${topic}: the core model`,
        description: `The two ideas everything else in ${topic} builds on.`,
        objective: `Describe the core model of ${topic} from memory.`,
        challenge: {
          title: "Explain it to a colleague",
          prompt: `Write a five-sentence explanation of ${topic} for someone new to it.`,
          successCriteria: ["Uses the core terms correctly", "Includes one concrete example"],
        },
        lessons: [
          lesson(`What ${topic} actually is`, `The defining idea of ${topic}`, `${topic} is often assumed to be more complicated than its core idea.`, "concept", "explain"),
          lesson(`${topic} in practice`, `Applying ${topic} to a first example`, "Knowing the definition is often mistaken for being able to apply it.", "worked-example", "classify"),
        ],
      },
      {
        title: `Using ${topic} well`,
        description: `Where ${topic} pays off and where it breaks down.`,
        objective: `Decide when ${topic} applies and when it does not.`,
        challenge: {
          title: "Boundary cases",
          prompt: `List two situations where ${topic} applies cleanly and one where it misleads.`,
          successCriteria: ["Identifies a genuine boundary case", "Explains why the boundary exists"],
        },
        lessons: [
          lesson(`Common failure modes`, `Where ${topic} goes wrong`, "Success cases are often assumed to generalize everywhere.", "case-study", "decide"),
          lesson(`Putting it together`, `Synthesizing ${topic} end to end`, "The pieces are often assumed to work alone rather than as a system.", "synthesis", "create"),
        ],
      },
    ],
    capstone: {
      title: `Apply ${topic} end to end`,
      brief: `Take a real situation you care about and work it through with ${topic} from framing to conclusion.`,
      deliverable: "A written walkthrough of your situation, decisions, and result.",
      successCriteria: [
        "Frames the situation using the course's core terms",
        "Shows at least one decision the framework changed",
        "States the result and one limitation honestly",
      ],
    },
  };
}

function stubLesson(input: string) {
  const concept = line(input, "Core concept: ") || "the core concept";
  const misconception = line(input, "Misconception to correct: ") || "a common misunderstanding";
  const body = paragraph(
    `${concept} matters because it changes what you do, not only what you can recite. Start from the situation you already understand, and notice where the naive approach quietly fails: that failure point is exactly where ${concept.toLowerCase()} earns its keep. A common belief — ${misconception.toLowerCase()} — feels reasonable right up until you test it against a concrete case, which is why this lesson works through one slowly instead of asserting the conclusion.`,
    4,
  );
  return {
    learningObjective: `Apply ${concept.toLowerCase()} to a new situation and explain the reasoning behind each step.`,
    connection: `This lesson builds directly on the previous concept and prepares the ground for what follows in the course sequence.`,
    keyTakeaways: [
      `${concept} is a tool for making decisions, not a definition to memorize.`,
      `The misconception — ${misconception.toLowerCase()} — fails on concrete cases.`,
      "Transfer to a new situation is the real test of understanding.",
    ],
    content: `## Why it matters\n\n${body}\n\n## Working through it\n\n${paragraph(`Take the example apart step by step and say out loud what each part contributes; the goal is reasoning you could repeat on a different example tomorrow.`, 3)}\n\n## Where it goes next\n\n${paragraph(`Once this holds, the next lesson can build on it without re-explaining the foundation.`, 2)}`,
    guidedPractice: {
      prompt: `Work through a small example of ${concept.toLowerCase()} and narrate each decision.`,
      steps: [
        "State what the situation is asking for in your own words before touching the method.",
        "Apply the core idea one step at a time, saying why each step is justified.",
      ],
      modelAnswer: "A careful walkthrough names the goal first, applies the idea stepwise, and checks the result against the original situation.",
    },
    transferTask: {
      prompt: `Use ${concept.toLowerCase()} in a situation different from the worked example.`,
      successCriteria: [
        "The new situation genuinely differs from the worked example",
        "Each step is justified by the concept, not pattern-matching",
      ],
      modelResponse: "A strong response picks an unfamiliar situation, maps the concept onto it explicitly, and notes one place where the mapping strains.",
    },
    quizzes: [
      {
        question: `What is the most accurate description of ${concept.toLowerCase()}?`,
        options: [
          "A decision tool that changes what you do in concrete situations",
          "A definition to memorize for later recall",
          "A synonym for the course topic as a whole",
          "A rule that applies identically in every situation",
        ],
        correctIndex: 0,
        explanation: "The concept earns its place by changing decisions in real situations.",
        optionFeedback: [
          "Correct: the concept is a tool for decisions, which is why the lesson practices transfer.",
          "Memorized definitions do not survive contact with a new situation.",
          "The concept is one part of the topic, not the whole of it.",
          "Boundary cases exist; the lesson covered where the idea strains.",
        ],
      },
      {
        question: "Why does the lesson work through the misconception directly?",
        options: [
          "Because testing a plausible belief against a concrete case builds durable understanding",
          "Because misconceptions are entertaining",
          "Because the misconception is always true in other fields",
          "Because correcting it is required by the quiz format",
        ],
        correctIndex: 0,
        explanation: "Contrast against a plausible wrong belief is what makes the correct idea stick.",
        optionFeedback: [
          "Correct: the contrast against a concrete case is what makes the correction durable.",
          "Entertainment is not the goal; durable correction is.",
          "The misconception fails on cases inside this domain too.",
          "The quiz format does not require it; the learning science does.",
        ],
      },
    ],
  };
}

function stubCapstoneVerdict(input: string) {
  const criteria = input
    .split("<learner_submission>")[0]
    .split("Success criteria:")[1]?.split("\n")
    .map((candidate) => candidate.trim())
    .filter((candidate) => /^\d+\.\s/.test(candidate))
    .map((candidate) => candidate.replace(/^\d+\.\s*/, "")) ?? [];
  const submission = input.split("<learner_submission>")[1]?.split("</learner_submission>")[0]?.trim() ?? "";
  // Deterministic for testing: a substantial submission passes, a thin one
  // fails all but the first criterion, so both verdict states are reachable.
  const substantial = submission.length >= 600;
  return {
    summary: substantial
      ? "The submission demonstrates each criterion with concrete evidence. (Local stub assessment.)"
      : "The submission is too thin to verify most criteria. Add concrete evidence for each one and resubmit. (Local stub assessment.)",
    criteria: criteria.map((criterion, index) => ({
      criterion: criterion.slice(0, 240),
      met: substantial || index === 0,
      feedback: substantial || index === 0
        ? "Concrete evidence present for this criterion."
        : "Not yet demonstrated: describe specifically how your work meets this criterion.",
    })),
  };
}

function stubUsage() {
  return { input_tokens: 0, output_tokens: 0, input_tokens_details: { cached_tokens: 0 } };
}

function localAiStub() {
  return {
    moderations: {
      create: async () => ({ results: [{ flagged: false, categories: {} }] }),
    },
    responses: {
      parse: async (params: { input?: unknown; text?: { format?: { name?: string } } }) => {
        const input = typeof params.input === "string" ? params.input : "";
        const format = params.text?.format?.name;
        const output_parsed = format === "course_outline"
          ? stubOutline(input)
          : format === "capstone_verdict"
            ? stubCapstoneVerdict(input)
            : stubLesson(input);
        return { id: `local-${crypto.randomUUID()}`, output_parsed, usage: stubUsage() };
      },
      create: async () => {
        const id = `local-${crypto.randomUUID()}`;
        const chunks = [
          "Good question. Start from what the lesson already established: ",
          "the concept is a decision tool, so test your idea against a concrete case. ",
          "Try restating the key idea in your own words, then check it against the lesson's worked example. ",
          "(Local stub tutor — set OPENAI_API_KEY to use the real model.)",
        ];
        return (async function* () {
          for (const delta of chunks) {
            yield { type: "response.output_text.delta", delta };
          }
          yield { type: "response.completed", response: { id, usage: stubUsage() } };
        })();
      },
    },
  };
}
