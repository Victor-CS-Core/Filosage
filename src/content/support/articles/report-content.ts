import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "report-content",
  title: "Report a lesson content issue",
  summary: "Send a factual, source, safety, copyright, or quality concern from the affected lesson.",
  category: "trust",
  keywords: ["report", "content", "accuracy", "source", "safety", "copyright", "lesson"],
  reviewedOn: "2026-08-05",
  sources: ["src/components/LessonIntegrityPanel.tsx", "src/app/api/content-reports/route.ts", "src/lib/content-report-policy.ts"],
  body: `
## Report from the affected lesson

Open the lesson's content information panel and choose **Report a content issue**. Select the issue type and, when useful, identify the claim or section that should be reviewed.

Available issue types cover possible factual errors, source or citation concerns, harmful or unsafe material, copyright concerns, and other quality problems.

## What happens next

After a successful submission, Erudoza confirms that the report entered the content review queue. A report is a request for human review; it is not confirmation that the lesson is wrong.

## If the in-lesson tool is unavailable

Use [contact support](/support/articles/contact-support). Include the course name, lesson title, affected section, what you expected, and what happened. Do not send private identity or ownership evidence unless support requests it through an appropriate channel.
`,
  related: ["complete-a-lesson", "contact-support", "privacy-controls"],
});
