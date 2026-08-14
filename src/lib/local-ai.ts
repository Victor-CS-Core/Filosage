import "server-only";

import OpenAI from "openai";
import { isLocalMode } from "@/lib/local-mode";
import { localCourseOutlineFixture } from "@/lib/local-course-fixture";
import { serverEnvironment } from "@/lib/runtime-environment";

/**
 * Returns a real OpenAI client whenever an API key is configured. In local
 * mode without a key it returns a stub with the same call surface the app
 * uses, producing deterministic content that satisfies the real Zod schemas
 * and the lesson quality gate — so every AI feature is exercisable offline.
 */
export function aiClient(): OpenAI {
  if (serverEnvironment.OPENAI_API_KEY || !isLocalMode()) {
    return new OpenAI({ apiKey: serverEnvironment.OPENAI_API_KEY });
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

function sourceDataFromInput(input: string) {
  const match = input.match(/<SOURCE_DATA>\s*([\s\S]*?)\s*<\/SOURCE_DATA>/);
  try {
    return match
      ? JSON.parse(match[1]) as Array<{ id?: string; evidenceClaims?: Array<{ id?: string; claim?: string; locator?: string }> }>
      : [];
  } catch {
    return [];
  }
}

function stubLesson(input: string) {
  const concept = line(input, "Core concept: ") || "the core concept";
  const misconception = line(input, "Misconception to correct: ") || "a common misunderstanding";
  const mode = line(input, "Teaching mode: ") || "concept";
  const buildsOn = line(input, "Builds on: ");
  const assignedSources = sourceDataFromInput(input);
  const groundedSource = assignedSources.find((source) => source.id && source.evidenceClaims?.some((claim) => claim.id && claim.claim));
  const groundedEvidence = groundedSource?.evidenceClaims?.find((claim) => claim.id && claim.claim);
  const groundedClaim = groundedEvidence?.claim ?? "";
  const learningObjective = `Apply ${concept.toLowerCase()} to a new situation and explain the reasoning behind each step.`;
  const recognitionSituations = [
    "A learner can repeat the definition but cannot choose what to do next.",
    "A new case differs from the example in one important constraint.",
    "The evidence supports an action, but one limitation remains unresolved.",
    "A proposed step does not connect to the stated goal.",
    "Two plausible options differ in how well they use the available evidence.",
    "The result looks reasonable, but it has not been checked against the original situation.",
  ];
  const recognitionItems = recognitionSituations.map((stimulus, index) => {
    const correct = {
      label: "Apply the concept and justify the next move",
      feedback: `This uses ${concept.toLowerCase()} as a decision tool and makes the reasoning visible.`,
    };
    const distractors = [
      { label: "Repeat the definition", feedback: "Repeating a definition does not demonstrate transfer to this situation." },
      { label: "Ignore the conflicting detail", feedback: "Ignoring a relevant constraint makes the application less defensible." },
      { label: "Choose from intuition alone", feedback: "An unsupported intuition does not connect the action to the lesson's evidence." },
    ];
    const correctIndex = index % 4;
    const choices = [...distractors];
    choices.splice(correctIndex, 0, correct);
    return {
      id: `item-local-${index + 1}`,
      stimulus: { kind: "text" as const, value: stimulus, accessibleLabel: stimulus },
      choices,
      correctIndex,
      explanation: `The strongest response applies ${concept.toLowerCase()}, explains the decision, and keeps the limitation visible.`,
      difficulty: index < 2 ? "foundation" as const : index < 4 ? "contrast" as const : "transfer" as const,
    };
  });
  const body = paragraph(
    `${concept} matters because it changes what you do, not only what you can recite. Start from the situation you already understand, and notice where the naive approach quietly fails: that failure point is exactly where ${concept.toLowerCase()} proves useful. A common belief, that ${misconception.toLowerCase()}, feels reasonable right up until you test it against a concrete case, which is why this lesson works through one slowly instead of asserting the conclusion.`,
    4,
  );
  const experience = mode === "worked-example"
    ? {
        type: "worked-example" as const,
        scenario: `A learner must use ${concept.toLowerCase()} to choose a defensible next step.`,
        steps: [
          { title: "Frame the decision", reasoning: "Naming the decision prevents premature method choice.", output: "A one-sentence decision statement." },
          { title: "Apply the concept", reasoning: `The relevant evidence is tested against ${concept.toLowerCase()}.`, output: "An evidence-linked recommendation." },
          { title: "Check the boundary", reasoning: "A limitation keeps the recommendation from claiming too much.", output: "A recommendation with one explicit caveat." },
        ],
        fadingPrompt: "Repeat the reasoning on a new case, supplying the final step yourself.",
      }
    : mode === "comparison"
      ? {
          type: "comparison" as const,
          options: ["Use the tempting shortcut", "Apply the evidence-linked concept"],
          criteria: [
            { criterion: "Evidence", first: "Relies on first impressions", second: "Names the evidence that changes the decision" },
            { criterion: "Transfer", first: "Repeats the example", second: "Adapts the concept to the new constraint" },
          ],
          boundaryCase: { prompt: "What if the evidence is incomplete?", resolution: "State the uncertainty and choose the smallest reversible next step." },
        }
      : mode === "case-study"
        ? {
            type: "case-study" as const,
            brief: `A team must apply ${concept.toLowerCase()} while facing a real constraint.`,
            evidence: [
              { label: "Goal", detail: "The result must support a named decision." },
              { label: "Constraint", detail: "The team has limited time and incomplete information." },
              { label: "Signal", detail: "One observation contradicts the tempting shortcut." },
            ],
            interpretations: ["The shortcut is sufficient", "The concept changes the next move"],
            decisionPrompt: "Choose an interpretation and defend it with all three evidence items.",
          }
        : mode === "practice-lab"
          ? {
              type: "practice-lab" as const,
              brief: `Build a small artifact that demonstrates ${concept.toLowerCase()}.`,
              materials: ["The situation brief", "The evidence list", "A decision template"],
              tasks: ["Frame the decision", "Apply the concept to the evidence", "Check the result against one boundary case"],
              artifactPrompt: "Produce a concise decision record with reasoning and one limitation.",
              successCriteria: ["Every claim points to evidence", "The limitation changes or qualifies the recommendation"],
            }
          : mode === "synthesis"
            ? {
                type: "synthesis" as const,
                challenge: `Combine the course ideas into one defensible use of ${concept.toLowerCase()}.`,
                connections: [
                  { concept, contribution: "Provides the decision rule." },
                  { concept: "Evidence checking", contribution: "Tests whether the rule fits the situation." },
                ],
                capstoneContribution: "A complete recommendation with evidence, tradeoff, and limitation.",
                reflectionPrompt: "Which connection did the most work, and where would it fail?",
              }
            : {
                type: "concept" as const,
                predictionPrompt: `Predict what changes when ${concept.toLowerCase()} is applied to the situation.`,
                mentalModel: {
                  title: "From situation to checked decision",
                  parts: [
                    { label: "Situation", role: "Names the decision and constraint" },
                    { label: "Concept", role: "Selects the relevant evidence and action" },
                    { label: "Check", role: "Tests the result and records a limitation" },
                  ],
                },
                misconceptionCheck: { claim: misconception, correction: `${concept} must change a concrete decision and survive a boundary check.` },
              };
  return {
    learningObjective,
    citations: groundedSource?.id && groundedEvidence?.id && groundedClaim
      ? [{ sourceId: groundedSource.id, evidenceClaimId: groundedEvidence.id, claim: groundedClaim, section: "content" as const, locator: groundedEvidence.locator }]
      : [],
    connection: `This lesson builds directly on the previous concept and prepares the ground for what follows in the course sequence.`,
    keyTakeaways: [
      `${concept} is a tool for making decisions, not a definition to memorize.`,
      `The misconception (${misconception.toLowerCase()}) fails on concrete cases.`,
      "Transfer to a new situation is the real test of understanding.",
    ],
    experience,
    content: `## Why it matters\n\n${groundedClaim ? `${groundedClaim}\n\n` : ""}${body}\n\n## Working through it\n\n${paragraph(`Take the example apart step by step and say out loud what each part contributes; the goal is reasoning you could repeat on a different example tomorrow.`, 3)}\n\n## Where it goes next\n\n${paragraph(`Once this holds, the next lesson can build on it without re-explaining the foundation.`, 2)}`,
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
    visuals: mode === "worked-example"
      ? [{
          id: "visual-worked-trace",
          type: "worked-example-trace",
          placement: "before-guided-practice",
          title: "Trace the reasoning",
          summary: "Follow the decision path before attempting it yourself.",
          version: 1,
          prompt: `Use ${concept.toLowerCase()} to make one defensible decision.`,
          steps: [
            { title: "Name the situation", detail: "Restate what has to be decided before choosing a method.", check: "Can you identify the decision in plain language?" },
            { title: "Apply the concept", detail: `Use ${concept.toLowerCase()} and explain why it changes the next move.`, check: "Does each move follow from the concept?" },
          ],
        }]
      : mode === "comparison"
        ? [{
          id: "visual-comparison",
          type: "comparison-matrix",
          placement: "after-explanation",
          title: "Keep the distinction visible",
          summary: "Compare the two ideas by the decisions they support.",
          version: 1,
          columns: ["Common assumption", "More accurate view"],
          rows: [
            { criterion: "What it treats as important", values: [misconception, concept] },
            { criterion: "What you do next", values: ["Rely on the first impression", "Test the situation against the concept"] },
          ],
        }]
        : (mode === "synthesis" || mode === "practice-lab")
          ? [{
            id: "visual-process-flow",
            type: "process-flow",
            placement: "after-explanation",
            title: "Move from framing to a checked result",
            summary: "A repeatable sequence for applying the lesson independently.",
            version: 1,
            steps: [
              { title: "Frame", detail: "Name the decision and the evidence that matters." },
              { title: "Apply", detail: `Use ${concept.toLowerCase()} one justified step at a time.` },
              { title: "Check", detail: "Compare the result with the original situation and note one limitation." },
            ],
          }]
          : (buildsOn && !buildsOn.startsWith("No named"))
            ? [{
              id: "visual-prerequisite-map",
              type: "prerequisite-map",
              placement: "after-purpose",
              title: "Where this lesson fits",
              summary: "A short map from the prior idea to the next capability.",
              version: 1,
              nodes: [
                { label: buildsOn, detail: "The foundation this lesson assumes.", role: "foundation" },
                { label: concept, detail: "The capability you are building now.", role: "current" },
                { label: "Apply the method independently", detail: "The next use of this idea.", role: "next" },
              ],
            }]
            : [{
          id: "visual-concept-contrast",
          type: "concept-contrast",
          placement: "after-purpose",
          title: "Correct the tempting shortcut",
          summary: "A concise contrast that keeps the central distinction visible.",
          version: 1,
          misconception,
          accurateView: `${concept} is a decision tool you test in a concrete situation.`,
          whyItMatters: "The distinction changes which evidence and actions deserve attention.",
            }],
    interactions: [{
      id: "interaction-recognition-local",
      type: "recognition",
      purpose: "practice",
      title: "Recognize a defensible application",
      summary: "Distinguish genuine application from plausible shortcuts before attempting transfer.",
      version: 2,
      targetSkill: learningObjective,
      referencePolicy: "hidden-until-complete",
      prompt: `Choose the response that applies ${concept.toLowerCase()} and makes its reasoning inspectable.`,
      mastery: { minimumFirstAttemptCorrect: 5, retryMissed: true },
      items: recognitionItems,
    }],
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

function stubCourseResearch() {
  return {
    sources: [
      {
        label: "NIST research and standards resource",
        url: "https://www.nist.gov/publications/local-grounded-research-fixture",
        publisher: "National Institute of Standards and Technology",
        publicationStatus: "released",
        statusCheck: "released-no-withdrawal-found",
        evidenceType: "official-guidance",
        evidenceClaims: [
          { claim: "NIST publishes released measurement research and technical standards that can ground factual explanations." },
          { claim: "NIST guidance documents bounded methods and their intended technical scope for applied practice." },
        ],
        reputationRationale: "NIST is a United States government measurement and standards authority.",
        limitations: "The specific resource must still be matched to the lesson claim.",
      },
      {
        label: "OECD research and policy evidence",
        url: "https://www.oecd.org/publications/local-grounded-research-fixture",
        publisher: "Organisation for Economic Co-operation and Development",
        publicationStatus: "released",
        statusCheck: "released-no-withdrawal-found",
        evidenceType: "official-guidance",
        evidenceClaims: [
          { claim: "OECD publishes released comparative research and documented policy evidence across participating economies." },
          { claim: "OECD evidence describes jurisdiction and date limitations that should remain visible in analytical examples." },
        ],
        reputationRationale: "OECD is an established intergovernmental research and policy institution.",
        limitations: "Coverage and applicability vary by country, date, and policy domain.",
      },
    ],
  };
}

function stubLessonGrounding(input: string) {
  const match = input.match(/<GROUNDING_DATA>([\s\S]*?)<\/GROUNDING_DATA>/);
  let citations: Array<{ citationId?: string; sourceId?: string }>;
  try {
    const parsed = match ? JSON.parse(match[1]) as { citations?: Array<{ citationId?: string; sourceId?: string }> } : null;
    citations = parsed?.citations ?? [];
  } catch {
    citations = [];
  }
  return {
    overallVerdict: "supported",
    unsupportedClaims: [],
    assessments: citations.map((citation) => ({
      citationId: citation.citationId,
      sourceId: citation.sourceId,
      verdict: "supported",
      evidenceNoteMatched: true,
      rationale: "The local fixture treats the supplied evidence note as direct support for this claim.",
    })),
  };
}

function stubCourseGrounding(input: string) {
  const match = input.match(/<COURSE_GROUNDING_DATA>([\s\S]*?)<\/COURSE_GROUNDING_DATA>/);
  let lessons: Array<{ moduleIndex?: number; lessonIndex?: number; assignedEvidence?: Array<{ sourceId?: string; evidenceClaims?: Array<{ id?: string }> }> }>;
  try {
    lessons = match ? JSON.parse(match[1]) as typeof lessons : [];
  } catch {
    lessons = [];
  }
  return {
    assessments: lessons.map((lesson) => ({
      moduleIndex: lesson.moduleIndex,
      lessonIndex: lesson.lessonIndex,
      sourceId: lesson.assignedEvidence?.[0]?.sourceId,
      evidenceClaimIds: (lesson.assignedEvidence?.[0]?.evidenceClaims ?? []).flatMap((claim) => typeof claim.id === "string" ? [claim.id] : []).slice(0, 1),
      verdict: "supported",
      rationale: "The local fixture treats the assigned evidence note as direct support for the planned lesson.",
    })),
  };
}

function stubSourceEvidenceValidation(input: string) {
  const match = input.match(/<SOURCE_VERIFICATION_DATA>([\s\S]*?)<\/SOURCE_VERIFICATION_DATA>/);
  let sources: Array<{ url?: string; evidenceClaims?: Array<{ id?: string }> }>;
  try {
    sources = match ? JSON.parse(match[1]) as typeof sources : [];
  } catch {
    sources = [];
  }
  return {
    sources: sources.map((source) => ({
      url: source.url,
      statusVerdict: "released-no-withdrawal-found",
      claims: (source.evidenceClaims ?? []).map((claim) => ({
        evidenceClaimId: claim.id,
        verdict: "supported",
        rationale: "The local evidence-validation fixture accepts this bounded claim for offline testing.",
      })),
    })),
  };
}

function stubCommandCenterDraft(input: string) {
  const agentType = line(input, "Agent type:") || "support";
  const subject = line(input, "Subject:") || "Current operational work";
  const isFounderBrief = agentType === "founderBrief";
  return {
    headline: isFounderBrief ? "Owner review brief" : `Review draft for ${subject}`,
    summary: isFounderBrief
      ? "The current queue was summarized into review priorities. This local draft contains no external action."
      : "The available ticket facts were organized into a review-only draft. Verify every claim before accepting it.",
    recommendedCategory: isFounderBrief ? null : agentType === "billing" ? "billing" : agentType === "legal" ? "legal" : agentType === "productOperations" ? "product_feedback" : "support",
    recommendedRisk: isFounderBrief ? null : "medium",
    recommendedTags: isFounderBrief ? ["founder-brief"] : ["draft-review"],
    responseDraft: isFounderBrief || agentType === "legal" || agentType === "productOperations"
      ? null
      : "Thanks for sharing these details. We are reviewing the confirmed facts and will follow up after the owner completes the review. (Local draft; not sent.)",
    missingInformation: isFounderBrief ? [] : ["Confirm the affected record and the exact observed behavior."],
    escalationReasons: agentType === "legal" ? ["Owner review is required for legal intake."] : [],
    evidenceUsed: ["Command-center ticket fields supplied to this run"],
    groupedSignals: agentType === "productOperations" ? ["A learner-friction signal needs grouping with related reports."] : [],
    priorities: isFounderBrief ? ["Review high-risk and overdue tickets first."] : [],
    confidence: "medium",
    confidenceRationale: "The draft is limited to the bounded context supplied to the local stub.",
    cautions: ["Review-only output. Do not treat this draft as verified or sent."],
  };
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
        const output_parsed = format === "command_center_draft"
          ? stubCommandCenterDraft(input)
          : format === "course_research"
            ? stubCourseResearch()
          : format === "lesson_grounding"
            ? stubLessonGrounding(input)
          : format === "course_grounding"
            ? stubCourseGrounding(input)
          : format === "source_evidence_validation"
            ? stubSourceEvidenceValidation(input)
          : format === "course_outline"
            ? localCourseOutlineFixture(
                line(input, "Create a complete but efficient course outline for: ") || "Your topic",
                sourceDataFromInput(input).flatMap((source) => typeof source.id === "string" ? [source.id] : []),
              )
          : format === "capstone_verdict"
            ? stubCapstoneVerdict(input)
            : stubLesson(input);
        const verificationMatch = input.match(/<SOURCE_VERIFICATION_DATA>([\s\S]*?)<\/SOURCE_VERIFICATION_DATA>/);
        let verificationUrls: string[];
        try {
          const verificationData = verificationMatch ? JSON.parse(verificationMatch[1]) as Array<{ url?: string }> : [];
          verificationUrls = verificationData.flatMap((item) => typeof item.url === "string" ? [item.url] : []);
        } catch {
          verificationUrls = [];
        }
        const output = format === "course_research"
          ? [
              { type: "web_search_call", id: `local-search-${crypto.randomUUID()}`, status: "completed", action: { type: "search", query: "local grounded course research" } },
              {
                type: "message",
                content: [{
                  type: "output_text",
                  text: "Local grounded research fixture.",
                  annotations: [
                    { type: "url_citation", url: "https://www.nist.gov/publications/local-grounded-research-fixture", title: "NIST" },
                    { type: "url_citation", url: "https://www.oecd.org/publications/local-grounded-research-fixture", title: "OECD" },
                  ],
                }],
              },
            ]
          : format === "source_evidence_validation"
            ? [
                { type: "web_search_call", id: `local-verify-${crypto.randomUUID()}`, status: "completed", action: { type: "search", query: "local source evidence verification" } },
                {
                  type: "message",
                  content: [{
                    type: "output_text",
                    text: "Local source evidence verification fixture.",
                    annotations: verificationUrls.map((url) => ({ type: "url_citation", url, title: url })),
                  }],
                },
              ]
          : [];
        return { id: `local-${crypto.randomUUID()}`, output_parsed, output, usage: stubUsage() };
      },
      create: async () => {
        const id = `local-${crypto.randomUUID()}`;
        const chunks = [
          "Good question. Start from what the lesson already established: ",
          "the concept is a decision tool, so test your idea against a concrete case. ",
          "Try restating the key idea in your own words, then check it against the lesson's worked example. ",
          "(Local stub tutor. Set OPENAI_API_KEY to use the real model.)",
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
