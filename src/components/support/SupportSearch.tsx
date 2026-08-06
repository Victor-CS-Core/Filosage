"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { matchesSearchQuery, normalizeSearchText } from "@/lib/search";

export interface SupportSearchItem {
  slug: string;
  title: string;
  summary: string;
  category: string;
  keywords: string[];
}

export default function SupportSearch({ articles }: { articles: SupportSearchItem[] }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearchText(deferredQuery);
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    return articles.filter((article) => matchesSearchQuery(deferredQuery, [article.title, article.summary, article.category, ...article.keywords]));
  }, [articles, deferredQuery, normalizedQuery]);

  const clearSearch = () => {
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="support-search-shell">
      <div className="support-search-field">
        <Search size={20} aria-hidden="true" />
        <label className="sr-only" htmlFor="support-search">Search Erudoza help</label>
        <input
          id="support-search"
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sign-in, lessons, reviews, privacy…"
          autoComplete="off"
          aria-controls={normalizedQuery ? "support-search-results" : undefined}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              clearSearch();
            }
          }}
        />
        {query && <button type="button" onClick={clearSearch} aria-label="Clear support search"><X size={18} /></button>}
      </div>
      {normalizedQuery && (
        <section className="support-search-results" id="support-search-results" aria-label="Support search results">
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
