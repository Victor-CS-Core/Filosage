import Link from "next/link";
import {
  BookOpenCheck,
  ChartNoAxesCombined,
  CircleHelp,
  GraduationCap,
  KeyRound,
  LockKeyhole,
  Mail,
  SearchCheck,
  ShieldCheck,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import SupportEmailLink from "@/components/support/SupportEmailLink";
import OwnerDocumentationEntry from "@/components/support/OwnerDocumentationEntry";
import SupportSearch from "@/components/support/SupportSearch";
import SupportTicketPanel from "@/components/support/SupportTicketPanel";
import { supportArticles } from "@/content/support/articles";
import { getSupportCategory, supportCategories } from "@/content/support/categories";
import type { SupportCategoryId } from "@/content/support/types";
import { SUPPORT_CONTACT } from "@/lib/legal";

const categoryIcons: Record<SupportCategoryId, typeof GraduationCap> = {
  start: GraduationCap,
  courses: BookOpenCheck,
  practice: SearchCheck,
  progress: ChartNoAxesCombined,
  account: KeyRound,
  trust: ShieldCheck,
  plans: CircleHelp,
};

const supportCollections: Array<{
  title: string;
  description: string;
  categories: SupportCategoryId[];
}> = [
  {
    title: "Learn with Erudoza",
    description: "Begin a course, work through lessons, practice, and understand your evidence.",
    categories: ["start", "courses", "practice", "progress"],
  },
  {
    title: "Account, trust, and support",
    description: "Manage access, privacy, safety, accessibility, plans, and direct support.",
    categories: ["account", "trust", "plans"],
  },
];

export default function SupportPage() {
  const searchItems = supportArticles.map((article) => ({
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    category: getSupportCategory(article.category)?.label ?? article.category,
    keywords: article.keywords,
  }));
  const contactHref = `mailto:${SUPPORT_CONTACT}?subject=${encodeURIComponent("Erudoza support request")}`;

  return (
    <AppShell>
      <div className="support-page support-wiki-home">
        <header className="support-header support-wiki-header">
          <p className="overline">Erudoza support</p>
          <h1>What do you need help with?</h1>
          <p>Find a clear answer about learning, progress, account access, or privacy. Every guide below is checked against the current Erudoza application.</p>
          <SupportSearch articles={searchItems} />
        </header>

        <OwnerDocumentationEntry />

        <SupportTicketPanel />

        <section className="support-featured" aria-labelledby="support-featured-title">
          <div className="support-section-heading"><h2 id="support-featured-title">Common tasks</h2><p>Start with the action closest to what you are trying to do.</p></div>
          <ul>
            {supportArticles.filter((article) => article.featured).map((article) => (
              <li key={article.slug}><Link href={`/support/articles/${article.slug}`}><span><strong>{article.title}</strong><small>{article.summary}</small></span><span aria-hidden="true">→</span></Link></li>
            ))}
          </ul>
        </section>

        <section className="support-category-list" aria-labelledby="support-categories-title">
          <div className="support-section-heading"><h2 id="support-categories-title">Browse the documentation</h2><p>Two clear paths cover the learning journey and account support without mixing unrelated tasks.</p></div>
          <div className="support-collections">
            {supportCollections.map((collection) => (
              <section className="support-collection" key={collection.title}>
                <header><h3>{collection.title}</h3><p>{collection.description}</p></header>
                {collection.categories.map((categoryId) => {
                  const category = supportCategories.find((candidate) => candidate.id === categoryId);
                  if (!category) return null;
                  const Icon = categoryIcons[category.id];
                  const articles = supportArticles.filter((article) => article.category === category.id);
                  return (
                    <section className="support-category" aria-labelledby={`support-category-${category.id}`} key={category.id}>
                      <header><span><Icon size={18} aria-hidden="true" /></span><div><h4 id={`support-category-${category.id}`}>{category.label}</h4><p>{category.description}</p></div></header>
                      <ul>{articles.map((article) => <li key={article.slug}><Link href={`/support/articles/${article.slug}`}>{article.title}<span aria-hidden="true">→</span></Link></li>)}</ul>
                    </section>
                  );
                })}
              </section>
            ))}
          </div>
        </section>

        <section className="support-contact" aria-labelledby="support-contact-title">
          <Mail size={21} aria-hidden="true" />
          <div><p className="overline">Direct contact</p><h2 id="support-contact-title">Still need help?</h2><p>Email {SUPPORT_CONTACT} with the affected page or course, what you expected, what happened, and the exact error message when available. Never send a password or authentication code.</p></div>
          <SupportEmailLink className="button button-primary" href={contactHref} presentation="call-to-action">Start an email</SupportEmailLink>
        </section>

        <section className="support-protection" aria-labelledby="support-protection-title">
          <LockKeyhole size={20} aria-hidden="true" />
          <div><h2 id="support-protection-title">Paid checkout is currently closed</h2><p>Joining the launch list or saving a pricing preference does not create a subscription or charge. <Link href="/support/articles/plans-and-billing">Read the current billing guidance</Link>.</p></div>
        </section>
      </div>
    </AppShell>
  );
}
