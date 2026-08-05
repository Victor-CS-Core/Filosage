"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

export interface SupportSearchItem {
  slug: string;
  title: string;
  summary: string;
  category: string;
  keywords: string[];
}

export default function SupportSearch({ articles }: { articles: SupportSearchItem[] }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    return articles.filter((article) => [article.title, article.summary, article.category, ...article.keywords]
      .some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [articles, normalizedQuery]);

  return (
    <div className="support-search-shell">
      <label className="support-search-field" htmlFor="support-search">
        <Search size={20} aria-hidden="true" />
        <span className="sr-only">Search Erudoza help</span>
        <input
          id="support-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sign-in, lessons, reviews, privacy…"
          autoComplete="off"
        />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear support search"><X size={18} /></button>}
      </label>
      {normalizedQuery && (
        <section className="support-search-results" aria-label="Support search results">
          <p className="support-result-count" role="status">{results.length} {results.length === 1 ? "guide" : "guides"} found</p>
          {results.length ? (
            <ul>
              {results.map((article) => (
                <li key={article.slug}>
                  <Link href={`/support/articles/${article.slug}`}>
                    <span><small>{article.category}</small><strong>{article.title}</strong><p>{article.summary}</p></span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="support-search-empty">
              <strong>No matching guide</strong>
              <p>Try a shorter task or browse the categories below. You can still contact support for a problem that is not documented.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
