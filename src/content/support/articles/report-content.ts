import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "report-content",
  title: "Report a course or lesson content issue",
  summary: "Send a factual, outdated, source, clarity, safety, copyright, or other concern from the affected content.",
  category: "trust",
  keywords: ["report", "content", "accuracy", "source", "safety", "copyright", "lesson"],
  reviewedOn: "2026-09-06",
  sources: ["src/app/api/support/capabilities/route.ts", "src/app/course/[topic]/page.tsx", "src/components/LessonIntegrityPanel.tsx", "src/app/api/content-reports/route.ts", "src/lib/content-report-policy.ts"],
  body: `
## Report from the affected lesson

Open the lesson's content information panel and choose **Report a content issue**. Select the issue type and, when useful, identify the claim or section that should be reviewed.

Available issue types include **Factual error**, **Outdated information**, **Source or citation concern**, **Unclear explanation**, **Harmful or unsafe material**, **Copyright concern**, and **Other**.

For a problem with a source listed on the course overview, choose **Report source** beside that source. This attaches the report to the relevant course and source record instead of requiring you to report an unrelated lesson.

## What happens next

After a successful submission, Filosage confirms that the report entered the content review queue. A report is a request for human review; it is not confirmation that the lesson is wrong.

## If the in-lesson tool is unavailable

Use [contact support](/support/articles/contact-support). Include the course name, lesson title, affected section, what you expected, and what happened. Do not send private identity or ownership evidence unless support requests it through an appropriate channel.
## Keep the report separate from a support request

Content reporting and the Support Center are separate controls. An accepted content report does not by itself confirm that a support ticket was created, that a reply was published, or that content was removed. If in-app support intake is unavailable, use the email option in [contact support](/support/articles/contact-support) and include the report reference if one was provided.
`,
  related: ["complete-a-lesson", "contact-support", "privacy-controls"],
});
