export type SupportCategoryId =
  | "start"
  | "courses"
  | "practice"
  | "progress"
  | "account"
  | "trust"
  | "plans";

export interface SupportCategory {
  id: SupportCategoryId;
  label: string;
  description: string;
}

export interface SupportArticle {
  slug: string;
  title: string;
  summary: string;
  category: SupportCategoryId;
  keywords: string[];
  reviewedOn: string;
  sources: string[];
  body: string;
  related: string[];
  featured?: boolean;
}

export function defineSupportArticle(article: SupportArticle) {
  return article;
}
