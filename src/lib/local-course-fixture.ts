import type { LessonMode, PracticeType } from "@/lib/course-types";

export function localCourseOutlineFixture(topic: string) {
  const lesson = (title: string, concept: string, misconception: string, mode: LessonMode, practice: PracticeType, contribution: string) => ({
    title,
    concept,
    estimatedMinutes: 10,
    objective: `Explain and apply ${concept.toLowerCase()} in a concrete situation.`,
    lessonMode: mode,
    buildsOn: [],
    misconception,
    practiceType: practice,
    masteryCriteria: `Apply ${concept.toLowerCase()} to a new example without prompting.`,
    activityPreview: `Work through a distinct ${practice} activity about ${concept.toLowerCase()}.`,
    artifactContribution: contribution,
  });
  return {
    mission: `Build a working understanding of ${topic} you can apply immediately.`,
    level: "Foundations" as const,
    estimatedMinutes: 240,
    outcome: `Explain the core ideas of ${topic} and apply them to a realistic situation.`,
    prerequisites: [],
    category: "Local test course",
    audience: `Learners who want a practical foundation in ${topic}.`,
    artifact: {
      title: `${topic} decision walkthrough`,
      description: `A structured walkthrough showing how to apply ${topic} to a realistic decision.`,
      format: "Written decision walkthrough",
    },
    scenario: {
      title: `${topic} in a real team decision`,
      context: `A small team must use ${topic} to choose a defensible next step with limited time.`,
      stakes: "A weak explanation would lead the team to repeat the same mistake.",
    },
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
        milestone: {
          title: "Core model map",
          deliverable: `A concise model map naming the essential parts of ${topic}.`,
          evidence: "A peer can use the map to explain the model without additional prompting.",
        },
        lessons: [
          lesson(`What ${topic} actually is`, `The defining idea of ${topic}`, `${topic} is often assumed to be more complicated than its core idea.`, "concept", "explain", "Draft the opening definition and name the decision it will support."),
          lesson(`${topic} in practice`, `Applying ${topic} to a first example`, "Knowing the definition is often mistaken for being able to apply it.", "worked-example", "classify", "Add an annotated worked example that makes each choice inspectable."),
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
        milestone: {
          title: "Boundary decision record",
          deliverable: `A decision record applying ${topic} to one fit case and one boundary case.`,
          evidence: "The record justifies both decisions using named evidence and one limitation.",
        },
        lessons: [
          lesson("Common failure modes", `Where ${topic} goes wrong`, "Success cases are often assumed to generalize everywhere.", "case-study", "decide", "Record one boundary case and the evidence that rules out the tempting response."),
          lesson("Putting it together", `Synthesizing ${topic} end to end`, "The pieces are often assumed to work alone rather than as a system.", "synthesis", "create", "Assemble the final recommendation, its tradeoff, and a check against the original goal."),
        ],
      },
    ],
    capstone: {
      title: `Complete the ${topic} decision walkthrough`,
      brief: `Take a real situation you care about and work it through with ${topic} from framing to conclusion.`,
      deliverable: `A written ${topic} decision walkthrough of your situation, decisions, and result.`,
      successCriteria: [
        "Frames the situation using the course's core terms",
        "Shows at least one decision the framework changed",
        "States the result and one limitation honestly",
      ],
    },
  };
}
