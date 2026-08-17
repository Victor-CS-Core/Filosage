import accessibility from "./accessibility";
import completeACapstone from "./complete-a-capstone";
import completeALesson from "./complete-a-lesson";
import contactSupport from "./contact-support";
import createACourse from "./create-a-course";
import findACourse from "./find-a-course";
import followACourse from "./follow-a-course";
import gettingStarted from "./getting-started";
import manageAndPublishACourse from "./manage-and-publish-a-course";
import manageProfile from "./manage-profile";
import navigateFilosage from "./navigate-filosage";
import plansAndBilling from "./plans-and-billing";
import privacyControls from "./privacy-controls";
import readEvidenceReport from "./read-evidence-report";
import reportContent from "./report-content";
import signInHelp from "./sign-in-help";
import understandProgress from "./understand-progress";
import useReview from "./use-review";
import useStudyTools from "./use-study-tools";

export const supportArticles = [
  gettingStarted,
  navigateFilosage,
  findACourse,
  createACourse,
  followACourse,
  completeALesson,
  completeACapstone,
  manageAndPublishACourse,
  useStudyTools,
  useReview,
  understandProgress,
  readEvidenceReport,
  manageProfile,
  signInHelp,
  privacyControls,
  reportContent,
  accessibility,
  plansAndBilling,
  contactSupport,
];

export function getSupportArticle(slug: string) {
  return supportArticles.find((article) => article.slug === slug);
}
