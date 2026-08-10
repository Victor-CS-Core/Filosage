"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileText,
  Inbox,
  LoaderCircle,
  LockKeyhole,
  Mail,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import AppDrawer, { useAppDrawer } from "@/components/AppDrawer";
import { useAuth } from "@/components/AuthProvider";
import { SUPPORT_CONTACT } from "@/lib/legal";
import { matchesSearchQuery } from "@/lib/search";
import type {
  LearnerSupportCategory,
  LearnerSupportTicketDetail,
  LearnerSupportTicketSummary,
  SupportArticleSummary,
} from "@/lib/support-center-types";
import styles from "./SupportCenter.module.css";

type SupportView = "help" | "new" | "requests";
type TicketField = "category" | "subject" | "message";
type TicketErrors = Partial<Record<TicketField, string>>;
const supportViews: SupportView[] = ["help", "new", "requests"];

interface TicketDraft {
  category: LearnerSupportCategory;
  subject: string;
  message: string;
}

interface SupportCenterProps {
  onRequestSignIn?: () => void;
  onBeforeOpen?: () => void;
}

const emptyDraft: TicketDraft = { category: "support", subject: "", message: "" };

const categoryLabels: Record<LearnerSupportCategory, string> = {
  support: "Using Filosage",
  billing: "Plans or billing",
  privacy: "Privacy request",
  product_feedback: "Product feedback",
  other: "Something else",
};

const statusLabels: Record<LearnerSupportTicketSummary["status"], string> = {
  submitted: "Submitted",
  in_review: "In review",
  resolved: "Resolved",
  closed: "Closed",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function validateDraft(draft: TicketDraft): TicketErrors {
  const errors: TicketErrors = {};
  const subject = draft.subject.trim();
  const message = draft.message.trim();
  if (!categoryLabels[draft.category]) errors.category = "Choose a request type.";
  if (subject.length < 5) errors.subject = "Enter a subject of at least 5 characters.";
  else if (subject.length > 160) errors.subject = "Keep the subject to 160 characters or fewer.";
  if (message.length < 20) errors.message = "Describe what happened using at least 20 characters.";
  else if (message.length > 2_000) errors.message = "Keep the description to 2,000 characters or fewer.";
  return errors;
}

function fieldErrorsFromResponse(value: unknown): TicketErrors {
  if (!value || typeof value !== "object") return {};
  const fieldErrors = "fieldErrors" in value ? value.fieldErrors : null;
  if (!fieldErrors || typeof fieldErrors !== "object") return {};
  const result: TicketErrors = {};
  for (const field of ["category", "subject", "message"] as const) {
    const messages = (fieldErrors as Record<string, unknown>)[field];
    if (Array.isArray(messages) && typeof messages[0] === "string") {
      result[field] = field === "subject"
        ? "Enter a subject between 5 and 160 characters."
        : field === "message"
          ? "Enter a description between 20 and 2,000 characters."
          : "Choose a request type.";
    }
  }
  return result;
}

export default function SupportCenter({ onRequestSignIn, onBeforeOpen }: SupportCenterProps) {
  const pathname = usePathname();
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const drawer = useAppDrawer("global-support-center");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const detailRequestRef = useRef(0);
  const previousUidRef = useRef<string | null>(null);
  const [view, setView] = useState<SupportView>("help");
  const [articles, setArticles] = useState<SupportArticleSummary[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [articlesError, setArticlesError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [draft, setDraft] = useState<TicketDraft>(emptyDraft);
  const [includeContext, setIncludeContext] = useState(true);
  const [pageTitle, setPageTitle] = useState("");
  const [fieldErrors, setFieldErrors] = useState<TicketErrors>({});
  const [submissionState, setSubmissionState] = useState<
    | { status: "idle" }
    | { status: "submitting" }
    | { status: "error"; message: string }
    | { status: "success"; ticketNumber: string; ticketId: string }
  >({ status: "idle" });
  const [tickets, setTickets] = useState<LearnerSupportTicketSummary[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<LearnerSupportTicketDetail | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const hiddenRoute = pathname.startsWith("/admin") || pathname.startsWith("/local-qa");

  const authenticatedFetch = useCallback(async (url: string, init?: RequestInit) => {
    if (!user) throw new Error("Sign in to continue.");
    const token = await user.getIdToken();
    return fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  }, [user]);

  const loadArticles = useCallback(async () => {
    if (articles.length || articlesLoading) return;
    setArticlesLoading(true);
    setArticlesError(null);
    try {
      const response = await fetch("/api/support/articles", { cache: "force-cache" });
      if (!response.ok) throw new Error("Help guides could not be loaded.");
      const body = await response.json() as { articles?: SupportArticleSummary[] };
      if (!Array.isArray(body.articles)) throw new Error("Help guides could not be loaded.");
      setArticles(body.articles);
    } catch {
      setArticlesError("Help guides could not be loaded. Open the full Support page or try again.");
    } finally {
      setArticlesLoading(false);
    }
  }, [articles.length, articlesLoading]);

  const loadTickets = useCallback(async () => {
    if (!user) {
      setTickets([]);
      return;
    }
    setTicketsLoading(true);
    setTicketsError(null);
    try {
      const response = await authenticatedFetch("/api/support/tickets");
      const body = await response.json().catch(() => ({})) as { tickets?: LearnerSupportTicketSummary[]; error?: string };
      if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again to view requests." : body.error ?? "Your requests could not be loaded.");
      setTickets(Array.isArray(body.tickets) ? body.tickets : []);
    } catch (error) {
      setTicketsError(error instanceof Error ? error.message : "Your requests could not be loaded.");
    } finally {
      setTicketsLoading(false);
    }
  }, [authenticatedFetch, user]);

  const loadTicketDetail = useCallback(async (ticketId: string) => {
    const requestId = ++detailRequestRef.current;
    setSelectedTicketId(ticketId);
    setSelectedTicket(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await authenticatedFetch(`/api/support/tickets/${encodeURIComponent(ticketId)}`);
      const body = await response.json().catch(() => ({})) as { ticket?: LearnerSupportTicketDetail; error?: string };
      if (!response.ok || !body.ticket) throw new Error(response.status === 404 ? "That support request could not be found." : body.error ?? "The request could not be loaded.");
      if (detailRequestRef.current !== requestId) return;
      setSelectedTicket(body.ticket);
      window.requestAnimationFrame(() => document.getElementById("support-ticket-detail-title")?.focus());
    } catch (error) {
      if (detailRequestRef.current !== requestId) return;
      setDetailError(error instanceof Error ? error.message : "The request could not be loaded.");
    } finally {
      if (detailRequestRef.current === requestId) setDetailLoading(false);
    }
  }, [authenticatedFetch]);

  const activateView = useCallback((nextView: SupportView, focusDestination = false) => {
    detailRequestRef.current += 1;
    setView(nextView);
    setSelectedTicket(null);
    setSelectedTicketId(null);
    setDetailError(null);
    if (nextView === "requests" && user) void loadTickets();
    if (focusDestination) {
      window.requestAnimationFrame(() => document.getElementById(`support-tab-${nextView}`)?.focus());
    }
  }, [loadTickets, user]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentView: SupportView) => {
    let nextIndex: number | null = null;
    const currentIndex = supportViews.indexOf(currentView);
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % supportViews.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + supportViews.length) % supportViews.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = supportViews.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextView = supportViews[nextIndex];
    activateView(nextView);
    window.requestAnimationFrame(() => document.getElementById(`support-tab-${nextView}`)?.focus());
  };

  const openSupport = useCallback((nextView: SupportView = "help", explicitOpener?: HTMLElement | null) => {
    const activeElement = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null;
    openerRef.current = explicitOpener ?? activeElement;
    onBeforeOpen?.();
    setPageTitle(document.title.replace(/\s+[|\u2014]\s+Filosage.*$/i, "").slice(0, 120));
    setView(nextView);
    setSelectedTicket(null);
    setSelectedTicketId(null);
    detailRequestRef.current += 1;
    setDetailError(null);
    drawer.openDrawer();
    void loadArticles();
    if (nextView === "requests" && user) void loadTickets();
  }, [drawer, loadArticles, loadTickets, onBeforeOpen, user]);

  const closeSupport = useCallback(() => {
    detailRequestRef.current += 1;
    drawer.closeDrawer();
    const returnTarget = openerRef.current?.isConnected ? openerRef.current : triggerRef.current;
    window.setTimeout(() => returnTarget?.focus(), 0);
  }, [drawer]);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: SupportView; opener?: HTMLElement }>).detail;
      openSupport(detail?.view ?? "help", detail?.opener);
    };
    window.addEventListener("filosage:open-support-center", listener);
    return () => window.removeEventListener("filosage:open-support-center", listener);
  }, [openSupport]);

  useEffect(() => {
    const uid = user?.uid ?? null;
    if (previousUidRef.current === uid) return;
    previousUidRef.current = uid;
    detailRequestRef.current += 1;
    setTickets([]);
    setSelectedTicket(null);
    setSelectedTicketId(null);
    setTicketsError(null);
    setDetailError(null);
    setDraft(emptyDraft);
    setSubmissionState({ status: "idle" });
    setFieldErrors({});
    idempotencyKeyRef.current = null;
    formRef.current?.reset();
  }, [user?.uid]);

  const visibleArticles = useMemo(() => {
    if (!deferredQuery.trim()) return articles.filter((article) => article.featured).slice(0, 5);
    return articles.filter((article) => matchesSearchQuery(deferredQuery, [
      article.title,
      article.summary,
      article.category,
      ...article.keywords,
    ]));
  }, [articles, deferredQuery]);

  const updateDraft = (field: keyof TicketDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value } as TicketDraft));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    if (submissionState.status === "error") {
      setSubmissionState({ status: "idle" });
      idempotencyKeyRef.current = null;
    }
  };

  const submitTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || submittingRef.current) return;
    const formElement = event.currentTarget;
    const capturedDraft = {
      category: draft.category,
      subject: draft.subject.trim(),
      message: draft.message.trim(),
    };
    const errors = validateDraft(capturedDraft);
    setFieldErrors(errors);
    const firstInvalid = Object.keys(errors)[0] as TicketField | undefined;
    if (firstInvalid) {
      if (firstInvalid === "subject") subjectRef.current?.focus();
      else if (firstInvalid === "message") messageRef.current?.focus();
      else {
        const categoryControl = formElement.elements.namedItem("category");
        if (categoryControl instanceof HTMLElement) categoryControl.focus();
      }
      return;
    }

    submittingRef.current = true;
    setSubmissionState({ status: "submitting" });
    idempotencyKeyRef.current ??= crypto.randomUUID();
    try {
      const response = await authenticatedFetch("/api/support/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          ...capturedDraft,
          ...(includeContext ? {
            requestContext: {
              pathname,
              ...(pageTitle ? { pageTitle } : {}),
            },
          } : {}),
        }),
      });
      const body = await response.json().catch(() => ({})) as {
        error?: string;
        fieldErrors?: Record<string, string[]>;
        ticketNumber?: string;
        ticketId?: string;
      };
      if (!response.ok || !body.ticketNumber || !body.ticketId) {
        const serverFieldErrors = fieldErrorsFromResponse(body);
        if (Object.keys(serverFieldErrors).length) setFieldErrors(serverFieldErrors);
        if (response.status === 401) throw new Error("Your session expired. Sign in again, then retry—your message is still here.");
        if (response.status === 429) throw new Error("You’ve sent five requests in the last 24 hours. Try again later, or email support.");
        throw new Error(body.error ?? "We couldn’t send your request. Your message is still here—try again or email support.");
      }
      formElement.reset();
      setDraft(emptyDraft);
      setFieldErrors({});
      setSubmissionState({ status: "success", ticketNumber: body.ticketNumber, ticketId: body.ticketId });
      idempotencyKeyRef.current = null;
      await loadTickets();
    } catch (error) {
      setSubmissionState({
        status: "error",
        message: error instanceof Error ? error.message : "We couldn’t send your request. Your message is still here—try again or email support.",
      });
    } finally {
      submittingRef.current = false;
    }
  };

  const requestSignIn = () => {
    drawer.closeDrawer();
    if (onRequestSignIn) onRequestSignIn();
    else void signInWithGoogle();
  };

  if (hiddenRoute) return null;

  return (
    <>
      <div className={`${styles.triggerWrap} ${user ? styles.withMobileNav : ""}`}>
        <button
          ref={triggerRef}
          className={styles.trigger}
          type="button"
          aria-label="Open Support Center"
          aria-describedby="support-center-tooltip"
          aria-haspopup="dialog"
          aria-expanded={drawer.open}
          aria-controls="global-support-center-drawer"
          onClick={() => openSupport("help", triggerRef.current)}
        >
          <Image src="/brand/icons/spark.svg" alt="" width={48} height={48} priority />
        </button>
        <span id="support-center-tooltip" role="tooltip" className={styles.tooltip}>Support center</span>
      </div>

      <AppDrawer
        id="global-support-center-drawer"
        open={drawer.open}
        onClose={closeSupport}
        labelledBy="support-center-title"
        placement="end"
        mobilePlacement="bottom"
        size="wide"
        className={`${styles.drawer} ${user ? styles.withMobileNav : ""}`}
      >
        <section className={styles.panel} aria-describedby="support-center-description">
          <header className={styles.header}>
            <span className={styles.headerSpark} aria-hidden="true"><Image src="/brand/icons/spark.svg" alt="" width={32} height={32} /></span>
            <div><h2 id="support-center-title">Support center</h2><p id="support-center-description">Find an answer or contact Filosage support.</p></div>
            <button className={styles.iconButton} type="button" onClick={closeSupport} aria-label="Close Support Center"><X size={20} aria-hidden="true" /></button>
          </header>

          <div className={styles.tabs} role="tablist" aria-label="Support Center views">
            {([
              ["help", "Help", BookOpenCheck],
              ["new", "New request", Send],
              ["requests", "My requests", Inbox],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                id={`support-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={view === id}
                aria-controls={view === id ? `support-panel-${id}` : undefined}
                tabIndex={view === id ? 0 : -1}
                className={view === id ? styles.activeTab : undefined}
                onClick={() => activateView(id)}
                onKeyDown={(event) => handleTabKeyDown(event, id)}
              ><Icon size={17} aria-hidden="true" /><span>{label}</span></button>
            ))}
          </div>

          <div className={styles.body}>
            {view === "help" && (
              <section id="support-panel-help" role="tabpanel" aria-labelledby="support-tab-help" className={styles.view}>
                <div className={styles.viewIntro}><h3>How can we help?</h3><p>Search current Filosage guidance before opening a request.</p></div>
                <label className={styles.searchField} htmlFor="support-center-search">
                  <Search size={18} aria-hidden="true" />
                  <span className="sr-only">Search help guides</span>
                  <input id="support-center-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sign-in, lessons, privacy…" autoComplete="off" />
                  {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear help search"><X size={17} aria-hidden="true" /></button>}
                </label>

                {articlesLoading && <SupportSkeleton label="Loading current guides" rows={3} />}
                {articlesError && <div className={styles.errorState} role="alert"><CircleAlert size={18} aria-hidden="true" /><div><strong>Guides unavailable</strong><p>{articlesError}</p><button type="button" className="button button-secondary button-small" onClick={() => { setArticlesError(null); void loadArticles(); }}><RefreshCw size={15} aria-hidden="true" />Try again</button></div></div>}
                {!articlesLoading && !articlesError && (
                  <section className={styles.articleSection} aria-labelledby="support-guide-results-title">
                    <div className={styles.sectionHeading}><h4 id="support-guide-results-title">{deferredQuery.trim() ? "Search results" : "Common guides"}</h4><span role="status">{visibleArticles.length} {visibleArticles.length === 1 ? "guide" : "guides"}</span></div>
                    {visibleArticles.length ? <ul className={styles.articleList}>{visibleArticles.map((article) => (
                      <li key={article.slug}><Link href={`/support/articles/${article.slug}`} onClick={closeSupport}><span><small>{article.category}</small><strong>{article.title}</strong><p>{article.summary}</p></span><ChevronRight size={18} aria-hidden="true" /></Link></li>
                    ))}</ul> : <div className={styles.emptyState}><Search size={20} aria-hidden="true" /><strong>No matching guide</strong><p>Try a shorter phrase, open the full help library, or send a request.</p><button className="button button-secondary button-small" type="button" onClick={() => setQuery("")}>Clear search</button></div>}
                  </section>
                )}
                <footer className={styles.viewFooter}><Link href="/support" onClick={closeSupport}>Browse all help guides <ExternalLink size={15} aria-hidden="true" /></Link><button type="button" onClick={() => activateView("new", true)}>Still need help? Send a request <ArrowRight size={15} aria-hidden="true" /></button></footer>
              </section>
            )}

            {view === "new" && (
              <section id="support-panel-new" role="tabpanel" aria-labelledby="support-tab-new" className={styles.view}>
                {!user ? (
                  <GuestRequestState loading={authLoading} onSignIn={requestSignIn} />
                ) : (
                  <>
                    <div className={styles.viewIntro}><h3>Send a support request</h3><p>We’ll link the request to your verified account and give you a reference number.</p></div>
                    <div className={styles.privacyNote}><LockKeyhole size={18} aria-hidden="true" /><p>Don’t include passwords, sign-in codes, payment-card details, identity documents, or unnecessary sensitive information. Account, privacy, and billing actions always require human review.</p></div>
                    <form ref={formRef} className={styles.form} onSubmit={submitTicket} noValidate>
                      <label htmlFor="support-request-category"><span>Request type</span><select id="support-request-category" name="category" value={draft.category} onChange={(event) => updateDraft("category", event.target.value)} disabled={submissionState.status === "submitting"} aria-invalid={Boolean(fieldErrors.category)} aria-describedby={fieldErrors.category ? "support-category-error" : undefined}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{fieldErrors.category && <small id="support-category-error" className={styles.fieldError}>{fieldErrors.category}</small>}</label>
                      <label htmlFor="support-request-subject"><span>Subject</span><input ref={subjectRef} id="support-request-subject" name="subject" value={draft.subject} onChange={(event) => updateDraft("subject", event.target.value)} disabled={submissionState.status === "submitting"} minLength={5} maxLength={160} placeholder="A short description of the problem" aria-invalid={Boolean(fieldErrors.subject)} aria-describedby={fieldErrors.subject ? "support-subject-error" : undefined} />{fieldErrors.subject && <small id="support-subject-error" className={styles.fieldError}>{fieldErrors.subject}</small>}</label>
                      <label htmlFor="support-request-message"><span>What happened?</span><textarea ref={messageRef} id="support-request-message" name="message" value={draft.message} onChange={(event) => updateDraft("message", event.target.value)} disabled={submissionState.status === "submitting"} minLength={20} maxLength={2000} rows={7} placeholder="Include the page or course, what you expected, what happened, and any exact error text." aria-invalid={Boolean(fieldErrors.message)} aria-describedby={fieldErrors.message ? "support-message-help support-message-error" : "support-message-help"} /><small id="support-message-help">20–2,000 characters. Your text stays in this form if sending fails.</small>{fieldErrors.message && <small id="support-message-error" className={styles.fieldError}>{fieldErrors.message}</small>}</label>
                      <div className={styles.contextToggle}><input id="support-request-context" type="checkbox" checked={includeContext} disabled={submissionState.status === "submitting"} onChange={(event) => { setIncludeContext(event.target.checked); setSubmissionState({ status: "idle" }); idempotencyKeyRef.current = null; }} /><label htmlFor="support-request-context"><strong>Include this page</strong><small>{pathname}{pageTitle ? ` · ${pageTitle}` : ""}</small></label></div>

                      {submissionState.status === "error" && <div className={styles.errorState} role="alert"><CircleAlert size={18} aria-hidden="true" /><div><strong>Request not sent</strong><p>{submissionState.message}</p><a href={`mailto:${SUPPORT_CONTACT}?subject=${encodeURIComponent("Filosage support request")}`}>Email {SUPPORT_CONTACT}</a></div></div>}
                      {submissionState.status === "success" && <div className={styles.successState} role="status"><Check size={18} aria-hidden="true" /><div><strong>Request sent</strong><p>Your reference is <b>{submissionState.ticketNumber}</b>. Keep this number if you contact support again.</p><button type="button" onClick={() => { activateView("requests", true); void loadTicketDetail(submissionState.ticketId); }}>View request</button></div></div>}

                      <footer className={styles.formFooter}><span>Up to five requests in 24 hours</span><button className="button button-primary" type="submit" disabled={submissionState.status === "submitting"}>{submissionState.status === "submitting" ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}{submissionState.status === "submitting" ? "Sending request…" : "Send request"}</button></footer>
                    </form>
                  </>
                )}
              </section>
            )}

            {view === "requests" && (
              <section id="support-panel-requests" role="tabpanel" aria-labelledby="support-tab-requests" className={styles.view}>
                {!user ? <GuestRequestState loading={authLoading} onSignIn={requestSignIn} tracking /> : selectedTicket || selectedTicketId || detailLoading || detailError ? (
                  <TicketDetail ticket={selectedTicket} loading={detailLoading} error={detailError} onBack={() => { detailRequestRef.current += 1; setDetailLoading(false); setSelectedTicket(null); setSelectedTicketId(null); setDetailError(null); window.requestAnimationFrame(() => document.getElementById("support-tab-requests")?.focus()); }} onRetry={() => selectedTicketId ? void loadTicketDetail(selectedTicketId) : undefined} />
                ) : (
                  <>
                    <div className={styles.viewIntroRow}><div className={styles.viewIntro}><h3>My requests</h3><p>Track requests submitted from this account.</p></div><button className={styles.iconButton} type="button" onClick={() => void loadTickets()} aria-label="Refresh my requests" disabled={ticketsLoading}><RefreshCw className={ticketsLoading ? "spin" : undefined} size={18} aria-hidden="true" /></button></div>
                    {ticketsLoading && <SupportSkeleton label="Loading your requests" rows={3} />}
                    {ticketsError && <div className={styles.errorState} role="alert"><CircleAlert size={18} aria-hidden="true" /><div><strong>Requests unavailable</strong><p>{ticketsError}</p><button type="button" className="button button-secondary button-small" onClick={() => void loadTickets()}><RefreshCw size={15} aria-hidden="true" />Try again</button></div></div>}
                    {!ticketsLoading && !ticketsError && tickets.length === 0 && <div className={styles.emptyState}><Inbox size={22} aria-hidden="true" /><strong>No support requests yet</strong><p>When you send a request, its reference and progress will appear here.</p><button className="button button-primary button-small" type="button" onClick={() => activateView("new", true)}>Send a request</button></div>}
                    {!ticketsLoading && !ticketsError && tickets.length > 0 && <ul className={styles.ticketList}>{tickets.map((ticket) => <li key={ticket.id}><button type="button" onClick={() => void loadTicketDetail(ticket.id)}><span className={styles.ticketMain}><small>{ticket.ticketNumber} · {categoryLabels[ticket.category]}</small><strong>{ticket.subject}</strong><span><Clock3 size={14} aria-hidden="true" />Updated {formatDate(ticket.updatedAt)}</span></span><span className={`${styles.status} ${styles[`status_${ticket.status}`]}`}>{statusLabels[ticket.status]}</span><ChevronRight size={18} aria-hidden="true" /></button></li>)}</ul>}
                  </>
                )}
              </section>
            )}
          </div>
        </section>
      </AppDrawer>
    </>
  );
}

function GuestRequestState({ loading, onSignIn, tracking = false }: { loading: boolean; onSignIn: () => void; tracking?: boolean }) {
  return <div className={styles.guestState}><span><LockKeyhole size={22} aria-hidden="true" /></span><h3>{tracking ? "Sign in to view your requests" : "Sign in to send a request"}</h3><p>Help guides remain public. Signing in connects a request to your account and lets you track its progress.</p><button className="button button-primary" type="button" disabled={loading} onClick={onSignIn}>{loading ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <LockKeyhole size={16} aria-hidden="true" />}Sign in</button><a className="button button-secondary" href={`mailto:${SUPPORT_CONTACT}?subject=${encodeURIComponent("Filosage support request")}`}><Mail size={16} aria-hidden="true" />Email {SUPPORT_CONTACT}</a></div>;
}

function SupportSkeleton({ label, rows }: { label: string; rows: number }) {
  return <div className={styles.loadingSkeleton} role="status" aria-label={label}>{Array.from({ length: rows }, (_, index) => <span key={index}><i /><b /><em /></span>)}</div>;
}

function TicketDetail({ ticket, loading, error, onBack, onRetry }: { ticket: LearnerSupportTicketDetail | null; loading: boolean; error: string | null; onBack: () => void; onRetry: () => void }) {
  if (loading) return <><button className={styles.backButton} type="button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Back to requests</button><SupportSkeleton label="Loading request details" rows={3} /></>;
  if (error || !ticket) return <><button className={styles.backButton} type="button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Back to requests</button><div className={styles.errorState} role="alert"><CircleAlert size={18} aria-hidden="true" /><div><strong>Request unavailable</strong><p>{error ?? "The request could not be loaded."}</p><button type="button" className="button button-secondary button-small" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />Try again</button></div></div></>;
  return <div className={styles.detail}><button className={styles.backButton} type="button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Back to requests</button><header><span className={`${styles.status} ${styles[`status_${ticket.status}`]}`}>{statusLabels[ticket.status]}</span><small>{ticket.ticketNumber}</small><h3 id="support-ticket-detail-title" tabIndex={-1}>{ticket.subject}</h3><p>{categoryLabels[ticket.category]} · Submitted {formatDate(ticket.createdAt)}</p></header><section><h4>Your description</h4><p className={styles.preserveText}>{ticket.description}</p></section>{ticket.requestContext && <section><h4>Page context you included</h4><p><code>{ticket.requestContext.pathname}</code>{ticket.requestContext.pageTitle ? ` · ${ticket.requestContext.pageTitle}` : ""}</p></section>}<section><h4>Support responses</h4>{ticket.publicReplies.length ? <ol className={styles.timeline}>{ticket.publicReplies.map((reply) => <li key={reply.id}><span aria-hidden="true"><Check size={13} /></span><div><p className={styles.preserveText}>{reply.body}</p><time dateTime={reply.createdAt}>{formatDate(reply.createdAt)}</time></div></li>)}</ol> : <div className={styles.emptyReplies}><FileText size={18} aria-hidden="true" /><p>No response has been published yet. Your request remains available for review.</p></div>}</section></div>;
}
