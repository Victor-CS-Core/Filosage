import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "follow-a-course",
  title: "Follow a course path",
  summary: "Read the course overview, move through its stages, and continue from the next incomplete lesson.",
  category: "courses",
  keywords: ["course overview", "learning plan", "diagnostic", "baseline", "pause", "module", "stage", "lesson", "next lesson", "capstone"],
  reviewedOn: "2026-09-06",
  sources: ["src/lib/learner-storage.ts", "src/lib/auth-server.ts",
    "src/app/course/[topic]/page.tsx",
    "src/components/CourseJourneyMap.tsx",
    "src/components/CourseDisclosure.tsx",
    "src/components/OutcomePlanner.tsx",
  ],
  body: `
## Read the overview

A course overview explains the intended outcome, estimated commitment, modules, lesson sequence, and any milestone or capstone included with that course.

Guests can inspect the structure of a published course. A free learner account is required to open lesson content.

## Build a personal learning route

Before lesson one, describe the outcome you want, where you will use it, what work will prove it, and the weekly time you can commit. The quick diagnostic is a self-report used to recommend a starting lesson; it does not lock lessons or count as demonstrated evidence.

You can edit or pause the plan later without deleting completed work. When the plan is paused, resuming reprioritizes due work without treating the pause as a penalty.

If the course has a capstone, a signed-in learner can optionally submit a starting sample for assessment against the same criteria used at the end. This assessed baseline is separate from the self-reported diagnostic and is required before Filosage can show comparable verified improvement.

## Move through the stages

Expand a stage to see its lessons and the evidence or challenge attached to that part of the course. Completed lessons display their completed state, and the course overview calculates progress from completed lessons that still belong to the course.

## Continue learning

The primary course action points to the first incomplete lesson. After a lesson, use the previous and next lesson controls or return to the course overview.

## Read source and evidence disclosures

The course information panel identifies its evidence mode. **Source-backed** material connects supported claims to released sources. Hybrid material combines verified sources with clearly labeled model knowledge. Model-knowledge sections do not present invented citations, and further reading is optional context rather than claim-level support.

Inspect a source before relying on an important claim. If a course-level source is wrong, outdated, unsafe, or unrelated, choose **Report source** beside that source. Lesson-specific concerns can be reported from the lesson integrity panel.
## Keep the route with the correct account

Your goal, baseline, progress and drafts belong to the account that recorded them. Sign back into that account to continue after switching users. A loading error does not mean the plan is empty, and an old tab cannot save work into the next account’s session. A course that is removed or made unavailable may require returning to Explore.
`,
  related: ["find-a-course", "complete-a-lesson", "complete-a-capstone", "understand-progress", "report-content"],
});
