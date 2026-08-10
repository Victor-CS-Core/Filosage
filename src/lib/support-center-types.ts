export const learnerSupportCategories = [
  "support",
  "billing",
  "privacy",
  "product_feedback",
  "other",
] as const;

export type LearnerSupportCategory = typeof learnerSupportCategories[number];

export interface SupportRequestContext {
  pathname: string;
  pageTitle?: string;
  feature?: string;
}

export type LearnerSupportStatus = "submitted" | "in_review" | "resolved" | "closed";

export interface LearnerSupportReply {
  id: string;
  body: string;
  createdAt: string;
}

export interface LearnerSupportTicketSummary {
  id: string;
  ticketNumber: string;
  subject: string;
  category: LearnerSupportCategory;
  status: LearnerSupportStatus;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
}

export interface LearnerSupportTicketDetail extends LearnerSupportTicketSummary {
  description: string;
  requestContext?: SupportRequestContext;
  publicReplies: LearnerSupportReply[];
}

export interface SupportArticleSummary {
  slug: string;
  title: string;
  summary: string;
  category: string;
  keywords: string[];
  featured: boolean;
}
