"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookMarked,
  CheckCircle2,
  ChevronRight,
  FileCode2,
  LoaderCircle,
  LockKeyhole,
  Search,
  ShieldCheck,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import type { OwnerDocumentation } from "@/content/support/owner-documentation-types";
import { matchesSearchQuery } from "@/lib/search";

export default function OwnerDocumentationPage() {
  const { user, isOwner, loading: authLoading } = useAuth();
  const [documentation, setDocumentation] = useState<OwnerDocumentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (!user || !isOwner) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/support/owner-documentation", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({})) as OwnerDocumentation & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The owner handbook could not be loaded.");
      setDocumentation(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The owner handbook could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [isOwner, user]);

  useEffect(() => {
    if (authLoading) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, load]);

  const sections = useMemo(() => {
    if (!documentation) return [];
    return documentation.sections.filter((section) => matchesSearchQuery(query, [
      section.title,
      section.summary,
      ...section.topics.flatMap((topic) => [topic.title, topic.body, ...(topic.steps ?? [])]),
    ]));
  }, [documentation, query]);

  if (authLoading) {
    return <AppShell><div className="center-state"><LoaderCircle className="spin" /><h1>Verifying owner access</h1></div></AppShell>;
  }
  if (!user || !isOwner) {
    return <AppShell><div className="center-state"><LockKeyhole /><h1>This page is not available.</h1><p>The Erudoza owner handbook is restricted to the verified owner account.</p><Link className="button button-primary" href="/support">Return to Support</Link></div></AppShell>;
  }

  return (
    <AppShell>
      <main className="owner-docs-page">
        <header className="owner-docs-header">
          <div>
            <Link href="/support"><ArrowLeft size={16} /> Support wiki</Link>
            <p><ShieldCheck size={14} /> Owner-only operating documentation</p>
            <h1>{documentation?.title ?? "Erudoza owner handbook"}</h1>
            <span>{documentation?.introduction ?? "Product and operational guidance for the verified Erudoza owner."}</span>
          </div>
          {documentation && <dl><div><dt>Version</dt><dd>{documentation.version}</dd></div><div><dt>Reviewed</dt><dd>{documentation.reviewedOn}</dd></div><div><dt>Coverage</dt><dd>{documentation.sections.length} sections</dd></div></dl>}
        </header>

        {error && <div className="owner-docs-error" role="alert"><span>{error}</span><button className="button button-secondary" onClick={() => void load()}>Try again</button></div>}

        {loading && !documentation ? (
          <div className="owner-docs-loading" aria-label="Loading owner handbook"><LoaderCircle className="spin" /><span>Loading verified documentation</span></div>
        ) : documentation ? (
          <div className="owner-docs-shell">
            <aside className="owner-docs-index">
              <label><Search size={16} /><span className="sr-only">Search owner handbook</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search handbook" /></label>
              <nav aria-label="Owner handbook sections">
                <strong>On this page</strong>
                {documentation.sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}<ChevronRight size={14} /></a>)}
              </nav>
              <div><BookMarked size={18} /><p><strong>Evidence-backed</strong>Each section names the application sources reviewed for this handbook.</p></div>
            </aside>

            <article className="owner-docs-content">
              {sections.map((section) => (
                <section id={section.id} className="owner-docs-section" key={section.id}>
                  <header><h2>{section.title}</h2><p>{section.summary}</p></header>
                  <div className="owner-docs-topics">
                    {section.topics.map((topic) => (
                      <section key={topic.title}>
                        <h3>{topic.title}</h3>
                        <p>{topic.body}</p>
                        {topic.steps && <ol>{topic.steps.map((step) => <li key={step}><CheckCircle2 size={16} /><span>{step}</span></li>)}</ol>}
                        {topic.links && <div className="owner-docs-links">{topic.links.map((link) => <Link key={link.href} href={link.href}>{link.label}<ChevronRight size={14} /></Link>)}</div>}
                      </section>
                    ))}
                  </div>
                  <footer><FileCode2 size={15} /><span><strong>Reviewed sources</strong>{section.sources.join(" · ")}</span></footer>
                </section>
              ))}
              {!sections.length && <div className="owner-docs-empty"><Search size={22} /><h2>No matching documentation</h2><p>Try a broader term such as course, support, privacy, billing, or release.</p></div>}
            </article>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
