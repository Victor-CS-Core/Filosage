import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "find-a-course",
  title: "Find a published course",
  summary: "Search the public library and narrow results by level or time commitment.",
  category: "courses",
  keywords: ["explore", "library", "search", "filter", "bookmark", "published course"],
  reviewedOn: "2026-08-05",
  sources: ["src/app/library/page.tsx", "src/components/CourseLibrary.tsx"],
  body: `
## Search the library

Open [Explore](/library), then enter a topic, skill, course name, or desired outcome. Search checks the published course topic, mission, category, and outcome.

## Narrow the results

Use **Level** and **Time commitment** to reduce the list. On smaller screens, choose **Search and filter** to open the same controls in a sheet.

Each course result shows its topic, outcome or mission, lesson count, estimated time, and level when those details are available.

## Save a course for later

Use the bookmark control on a course result to add or remove it from your saved courses. To begin learning, open the course and review its complete outline.
`,
  related: ["getting-started", "follow-a-course", "manage-profile"],
  featured: true,
});
