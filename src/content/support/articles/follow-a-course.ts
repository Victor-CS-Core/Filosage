import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "follow-a-course",
  title: "Follow a course path",
  summary: "Read the course overview, move through its stages, and continue from the next incomplete lesson.",
  category: "courses",
  keywords: ["course overview", "module", "stage", "lesson", "next lesson", "capstone"],
  reviewedOn: "2026-08-05",
  sources: [
    "src/app/course/[topic]/page.tsx",
    "src/components/CourseJourneyMap.tsx",
    "src/components/CourseDisclosure.tsx",
  ],
  body: `
## Read the overview

A course overview explains the intended outcome, estimated commitment, modules, lesson sequence, and any milestone or capstone included with that course.

Guests can inspect the structure of a published course. A free learner account is required to open lesson content.

## Move through the stages

Expand a stage to see its lessons and the evidence or challenge attached to that part of the course. Completed lessons display their completed state, and the course overview calculates progress from completed lessons that still belong to the course.

## Continue learning

The primary course action points to the first incomplete lesson. After a lesson, use the previous and next lesson controls or return to the course overview.
`,
  related: ["find-a-course", "complete-a-lesson", "understand-progress"],
});
