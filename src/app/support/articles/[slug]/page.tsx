import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarCheck2, Mail } from "lucide-react";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import SupportArticleBody, { getSupportHeadings } from "@/components/support/SupportArticleBody";
import { getSupportArticle, supportArticles } from "@/content/support/articles";
import { getSupportCategory } from "@/content/support/categories";
import { SUPPORT_CONTACT } from "@/lib/legal";

export const dynamicParams = false;

export function generateStaticParams() {
  return supportArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: PageProps<"/support/articles/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = getSupportArticle(slug);
  if (!article) return {};
  return {
    title: `${article.title} | Support`,
    description: article.summary,
    alternates: { canonical: `/support/articles/${article.slug}` },
  };
}

export default async function SupportArticlePage({ params }: PageProps<"/support/articles/[slug]">) {
  const { slug } = await params;
  const article = getSupportArticle(slug);
  if (!article) notFound();
  const category = getSupportCategory(article.category);
  const categoryArticles = supportArticles.filter((item) => item.category === article.category);
  const related = article.related.map(getSupportArticle).filter((item) => item !== undefined);
  const headings = getSupportHeadings(article.body);
  const reviewedDate = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${article.reviewedOn}T00:00:00Z`));
  const contactHref = `mailto:${SUPPORT_CONTACT}?subject=${encodeURIComponent(`Erudoza support: ${article.title}`)}`;

  return (
    <AppShell>
      <div className="support-article-page">
        <nav className="support-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/support"><ArrowLeft size={14} aria-hidden="true" /> Support</Link>
          <span aria-hidden="true">/</span>
          <span>{category?.label}</span>
        </nav>

        <div className="support-article-layout">
          <aside className="support-article-nav" aria-label="Support category navigation">
            <strong>{category?.label}</strong>
            <ul>{categoryArticles.map((item) => <li key={item.slug}><Link className={item.slug === article.slug ? "is-current" : ""} aria-current={item.slug === article.slug ? "page" : undefined} href={`/support/articles/${item.slug}`}>{item.title}</Link></li>)}</ul>
            <Link className="support-all-guides" href="/support">All help topics <ArrowRight size={14} /></Link>
          </aside>

          <article className="support-article-main" id="support-article-content">
            <header className="support-article-header">
              <p className="overline">{category?.label}</p>
              <h1>{article.title}</h1>
              <p>{article.summary}</p>
              <span><CalendarCheck2 size={15} aria-hidden="true" /> Reviewed against the app on <time dateTime={article.reviewedOn}>{reviewedDate}</time></span>
            </header>

            {headings.length > 1 && <details className="support-mobile-contents"><summary>On this page</summary><ol>{headings.map((heading) => <li key={heading.id}><a href={`#${heading.id}`}>{heading.label}</a></li>)}</ol></details>}
            <SupportArticleBody body={article.body} />

            {related.length > 0 && (
              <section className="support-related" aria-labelledby="support-related-title">
                <h2 id="support-related-title">Related help</h2>
                <ul>{related.map((item) => <li key={item.slug}><Link href={`/support/articles/${item.slug}`}><span><strong>{item.title}</strong><small>{item.summary}</small></span><ArrowRight size={16} aria-hidden="true" /></Link></li>)}</ul>
              </section>
            )}

            <section className="support-article-contact" aria-labelledby="support-article-contact-title">
              <Mail size={20} aria-hidden="true" />
              <div><h2 id="support-article-contact-title">This guide did not solve it?</h2><p>Contact support with the page, what you expected, what happened, and any exact error message.</p></div>
              <a className="button button-secondary" href={contactHref}>Email support</a>
            </section>
          </article>

          {headings.length > 1 && <aside className="support-article-contents" aria-label="On this page"><strong>On this page</strong><ol>{headings.map((heading) => <li key={heading.id}><a href={`#${heading.id}`}>{heading.label}</a></li>)}</ol></aside>}
        </div>
      </div>
    </AppShell>
  );
}
