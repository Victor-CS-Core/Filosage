import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "find-a-course",
  title: "Find a published course",
  summary: "Search the public library and narrow results by level or time commitment.",
  category: "courses",
  keywords: ["explore", "library", "search", "filter", "bookmark", "published course"],
  reviewedOn: "2026-08-05",
  sources: ["src/app/library/page.tsx", "src/components/CourseLibrary.tsx", "src/lib/search.ts"],
  body: `
## Search the library

Open [Explore](/library), then enter a topic, skill, course name, lesson, prerequisite, desired outcome, or capstone artifact. Search checks course, module, and lesson details across the published library.

You can enter several words in any order. Matching ignores capitalization, punctuation, and accents, so a search does not have to reproduce the exact title.

## Narrow the results

Use **Level** and **Time commitment** to reduce the list. On smaller screens, choose **Search and filter** to open the same controls in a sheet.

The result count updates as you search. In the mobile filter sheet, choose **Reset** to clear the search and return every available level and time commitment. If a search has no matches, **Clear filters** does the same.

Each course result shows its topic, outcome or mission, lesson count, estimated time, and level when those details are available.

## Save a course for later

Use the bookmark control on a course result to add or remove it from your saved courses. To begin learning, open the course and review its complete outline.
`,
  related: ["getting-started", "follow-a-course", "manage-profile"],
  featured: true,
});
