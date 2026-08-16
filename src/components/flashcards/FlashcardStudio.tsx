"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpenCheck,
  Check,
  ChevronRight,
  CircleAlert,
  FilePenLine,
  Layers3,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import FlashcardReviewer from "@/components/flashcards/FlashcardReviewer";
import type { Course } from "@/lib/course-types";
import type {
  FlashcardDeck,
  FlashcardDeckDetail,
  FlashcardDepth,
  FlashcardEmphasis,
  FlashcardScope,
  FlashcardType,
} from "@/lib/flashcards";
import type { CourseProgress } from "@/lib/learning-types";

interface LessonDeckContext {
  courseId: string;
  courseTopic: string;
  lessonId: string;
  moduleIndex: number;
}

interface FlashcardStudioProps {
  lessonContext?: LessonDeckContext;
}

interface EditableCard {
  id?: string;
  localId: string;
  prompt: string;
  answer: string;
  type: FlashcardType;
}

type WorkspaceMode = "study" | "generate" | "custom" | "edit";

function editableCard(card?: { id?: string; prompt?: string; answer?: string; type?: FlashcardType }): EditableCard {
  return {
    id: card?.id,
    localId: card?.id ?? crypto.randomUUID(),
    prompt: card?.prompt ?? "",
    answer: card?.answer ?? "",
    type: card?.type ?? "recall",
  };
}

function deckScopeLabel(deck: FlashcardDeck) {
  if (deck.kind === "custom") return "Custom deck";
  if (deck.kind === "recovered") return "Recovered deck";
  if (deck.scope === "lesson") return "Lesson deck";
  if (deck.scope === "module") return "Module deck";
  return "Course deck";
}

function generationQuotaLabel(limit: number | null | undefined, remaining: number | null | undefined) {
  if (limit === undefined) return "Generation allowance unavailable";
  if (limit === null) return "Generation available";
  if (remaining === undefined || remaining === null) return `${limit} generations available each month`;
  return `${remaining} of ${limit} generations left this month`;
}

export default function FlashcardStudio({ lessonContext }: FlashcardStudioProps) {
  const { user, account, loading: authLoading, signInWithGoogle, refreshAccount } = useAuth();
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FlashcardDeckDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<WorkspaceMode>(lessonContext ? "study" : "study");
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [courseId, setCourseId] = useState(lessonContext?.courseId ?? "");
  const [scope, setScope] = useState<FlashcardScope>(lessonContext ? "lesson" : "lesson");
  const [lessonId, setLessonId] = useState(lessonContext?.lessonId ?? "");
  const [moduleIndex, setModuleIndex] = useState(lessonContext?.moduleIndex ?? 0);
  const [depth, setDepth] = useState<FlashcardDepth>("balanced");
  const [emphasis, setEmphasis] = useState<FlashcardEmphasis>("balanced");
  const [includeAttemptedChecks, setIncludeAttemptedChecks] = useState(true);
  const [editorTitle, setEditorTitle] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorCards, setEditorCards] = useState<EditableCard[]>([editableCard()]);
  const [deleteConfirmDeckId, setDeleteConfirmDeckId] = useState<string | null>(null);

  const quota = account?.quotas.find((item) => item.feature === "flashcard_generation");
  const canCreateCustomDeck = Boolean(account?.capabilities.createCustomFlashcardDeck);

  const getToken = useCallback(async () => {
    if (!user) throw new Error("Sign in to use private flashcard decks.");
    return user.getIdToken();
  }, [user]);

  const authorizedFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    return fetch(path, {
      ...init,
      cache: "no-store",
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  }, [getToken]);

  const loadDecks = useCallback(async () => {
    if (!user) {
      setDecks([]);
      setSelectedDeckId(null);
      setLoaded(true);
      return;
    }
    const response = await authorizedFetch("/api/flashcards/decks");
    const body = await response.json().catch(() => ({})) as { decks?: FlashcardDeck[]; error?: string };
    if (!response.ok) throw new Error(body.error || "Your flashcard decks could not be loaded.");
    const nextDecks = body.decks ?? [];
    setDecks(nextDecks);
    setSelectedDeckId((current) => {
      if (current && nextDecks.some((deck) => deck.id === current)) return current;
      const lessonDeck = lessonContext
        ? nextDecks.find((deck) => deck.courseId === lessonContext.courseId && deck.lessonIds.includes(lessonContext.lessonId))
        : undefined;
      return lessonDeck?.id ?? nextDecks[0]?.id ?? null;
    });
    setLoaded(true);
  }, [authorizedFetch, lessonContext, user]);

  useEffect(() => {
    if (authLoading) return;
    const timer = window.setTimeout(() => {
      void loadDecks().catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Your flashcard decks could not be loaded.");
        setLoaded(true);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, loadDecks]);

  useEffect(() => {
    if (!user || lessonContext) return;
    void authorizedFetch("/api/progress")
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { progress?: CourseProgress[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Your learning courses could not be loaded.");
        const nextProgress = body.progress ?? [];
        setProgress(nextProgress);
        setCourseId((current) => current || nextProgress[0]?.courseId || "");
      })
      .catch(() => setProgress([]));
  }, [authorizedFetch, lessonContext, user]);

  useEffect(() => {
    if (!user || !courseId || lessonContext) return;
    let cancelled = false;
    void authorizedFetch(`/api/courses/${encodeURIComponent(courseId)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as Course & { error?: string };
        if (!response.ok) throw new Error(body.error || "The selected course could not be loaded.");
        if (cancelled) return;
        setCourse(body);
        setModuleIndex(0);
        setLessonId("0-0");
      })
      .catch((courseError) => {
        if (!cancelled) setError(courseError instanceof Error ? courseError.message : "The selected course could not be loaded.");
      });
    return () => { cancelled = true; };
  }, [authorizedFetch, courseId, lessonContext, user]);

  useEffect(() => {
    if (!user || !selectedDeckId) return;
    let cancelled = false;
    void authorizedFetch(`/api/flashcards/decks/${encodeURIComponent(selectedDeckId)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as FlashcardDeckDetail & { error?: string };
        if (!response.ok) throw new Error(body.error || "The selected deck could not be loaded.");
        if (!cancelled) setDetail(body);
      })
      .catch((detailError) => {
        if (!cancelled) setError(detailError instanceof Error ? detailError.message : "The selected deck could not be loaded.");
      });
    return () => { cancelled = true; };
  }, [authorizedFetch, selectedDeckId, user]);

  const startEditing = () => {
    if (!detail) return;
    setEditorTitle(detail.deck.title);
    setEditorDescription(detail.deck.description);
    setEditorCards(detail.cards.map((card) => editableCard(card)));
    setMode("edit");
    setNotice(null);
    setDeleteConfirmDeckId(null);
  };

  const startCustom = () => {
    if (!canCreateCustomDeck) return;
    setEditorTitle("");
    setEditorDescription("");
    setEditorCards([editableCard()]);
    setMode("custom");
    setNotice(null);
    setDeleteConfirmDeckId(null);
  };

  const updateEditorCard = (localId: string, patch: Partial<EditableCard>) => {
    setEditorCards((cards) => cards.map((card) => card.localId === localId ? { ...card, ...patch } : card));
  };

  const validateEditor = () => {
    if (!editorTitle.trim()) return "Give this deck a clear title.";
    if (!editorCards.length) return "Keep at least one card in the deck.";
    const incomplete = editorCards.find((card) => card.prompt.trim().length < 8 || !card.answer.trim());
    return incomplete ? "Every card needs a specific prompt and an answer." : null;
  };

  const saveEditor = async () => {
    const validationError = validateEditor();
    if (validationError || busy) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const creating = mode === "custom";
      if (!creating && !detail) throw new Error("Choose a deck before saving.");
      const body = {
        ...(creating ? {} : { revision: detail?.deck.revision, status: detail?.deck.status === "draft" ? "active" : detail?.deck.status }),
        title: editorTitle.trim(),
        description: editorDescription.trim(),
        cards: editorCards.map(({ id, prompt, answer, type }) => ({ ...(id ? { id } : {}), prompt: prompt.trim(), answer: answer.trim(), type })),
      };
      const response = await authorizedFetch(
        creating ? "/api/flashcards/decks" : `/api/flashcards/decks/${encodeURIComponent(detail!.deck.id)}`,
        {
          method: creating ? "POST" : "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(creating ? { "Idempotency-Key": crypto.randomUUID() } : {}),
          },
          body: JSON.stringify(body),
        },
      );
      const saved = await response.json().catch(() => ({})) as FlashcardDeckDetail & { error?: string };
      if (!response.ok) throw new Error(saved.error || "The deck could not be saved.");
      setDetail(saved);
      setSelectedDeckId(saved.deck.id);
      setMode("study");
      setNotice(creating ? "Custom deck created." : "Deck changes saved.");
      await loadDecks();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The deck could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const generateDeck = async (recommendedLesson = false) => {
    if (busy) return;
    const generationCourseId = lessonContext?.courseId ?? courseId;
    const generationScope = recommendedLesson ? "lesson" : scope;
    const generationLessonId = lessonContext?.lessonId ?? lessonId;
    const generationModuleIndex = lessonContext?.moduleIndex ?? moduleIndex;
    if (!generationCourseId) {
      setError("Choose a course before generating a deck.");
      return;
    }
    if (generationScope === "lesson" && !generationLessonId) {
      setError("Choose a lesson for this deck.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authorizedFetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          courseId: generationCourseId,
          scope: generationScope,
          ...(generationScope === "lesson" ? { lessonId: generationLessonId } : {}),
          ...(generationScope === "module" ? { moduleIndex: generationModuleIndex } : {}),
          depth: recommendedLesson ? "balanced" : depth,
          emphasis: recommendedLesson ? "balanced" : emphasis,
          includeAttemptedChecks: recommendedLesson ? true : includeAttemptedChecks,
        }),
      });
      const generated = await response.json().catch(() => ({})) as FlashcardDeckDetail & { error?: string };
      if (!response.ok) throw new Error(generated.error || "The deck could not be generated.");
      setDetail(generated);
      setSelectedDeckId(generated.deck.id);
      setMode("study");
      setNotice(`${generated.deck.cardCount}-card deck created and checked.`);
      await Promise.all([loadDecks(), refreshAccount()]);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "The deck could not be generated.");
    } finally {
      setBusy(false);
    }
  };

  const removeDeck = async () => {
    if (!detail || busy) return;
    if (deleteConfirmDeckId !== detail.deck.id) {
      setDeleteConfirmDeckId(detail.deck.id);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await authorizedFetch(`/api/flashcards/decks/${encodeURIComponent(detail.deck.id)}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "The deck could not be removed.");
      setDetail(null);
      setSelectedDeckId(null);
      setDeleteConfirmDeckId(null);
      setNotice("Deck removed from your library.");
      await loadDecks();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The deck could not be removed.");
    } finally {
      setBusy(false);
    }
  };

  const lessons = useMemo(() => course?.modules.flatMap((courseModule, currentModuleIndex) =>
    courseModule.lessons.map((lesson, currentLessonIndex) => ({
      id: `${currentModuleIndex}-${currentLessonIndex}`,
      title: lesson.title,
      moduleIndex: currentModuleIndex,
      moduleTitle: courseModule.title,
    })),
  ) ?? [], [course]);
  const lessonDecks = lessonContext
    ? decks.filter((deck) => deck.courseId === lessonContext.courseId && deck.lessonIds.includes(lessonContext.lessonId))
    : [];

  if (authLoading || !loaded) {
    return <div className={`flashcard-studio-loading${lessonContext ? " is-lesson" : ""}`} aria-busy="true"><LoaderCircle className="spin" size={20} /> Preparing your flashcards…</div>;
  }

  if (!user) {
    return (
      <section className={`flashcard-signin${lessonContext ? " is-lesson" : ""}`}>
        <span><Layers3 size={22} /></span>
        <div><strong>Keep flashcards across devices</strong><p>Sign in to generate grounded decks, edit cards, and save review dates privately.</p></div>
        <button className="button button-primary" type="button" onClick={() => void signInWithGoogle()}>Sign in to continue</button>
      </section>
    );
  }

  if (lessonContext) {
    return (
      <section className="lesson-flashcard-studio">
        <header>
          <div><strong>Lesson flashcards</strong><p>Generated only when you ask, then checked against this lesson.</p></div>
          <Link href="/review/flashcards">Open deck library <ChevronRight size={15} /></Link>
        </header>
        <div className="lesson-deck-command">
          <div>
            <span><Sparkles size={18} /></span>
            <div><strong>Create a recommended deck</strong><p>Balanced depth · mixed recall and application · attempted checks included</p></div>
          </div>
          <button className="button button-primary" type="button" disabled={busy || !quota || quota.remaining === 0} onClick={() => void generateDeck(true)}>
            {busy ? <><LoaderCircle className="spin" size={15} /> Generating…</> : "Generate deck"}
          </button>
          <small>{generationQuotaLabel(quota?.limit, quota?.remaining)}</small>
        </div>
        {lessonDecks.length > 0 && (
          <label className="lesson-deck-select">Study deck
            <select value={selectedDeckId ?? ""} onChange={(event) => setSelectedDeckId(event.target.value)}>
              {lessonDecks.map((deck) => <option key={deck.id} value={deck.id}>{deck.title} · {deck.cardCount} cards</option>)}
            </select>
          </label>
        )}
        {notice && <p className="flashcard-notice" role="status"><Check size={15} /> {notice}</p>}
        {error && <p className="form-error" role="alert"><CircleAlert size={15} /> {error}</p>}
        {detail && lessonDecks.some((deck) => deck.id === detail.deck.id) && <FlashcardReviewer key={detail.deck.id} detail={detail} getToken={getToken} />}
      </section>
    );
  }

  return (
    <section className="flashcard-studio-page">
      <header className="flashcard-studio-header">
        <div><h1>Flashcard decks</h1><p>Build precise recall from your courses, then keep the cards that earn their place.</p></div>
        <span className="flashcard-quota"><Sparkles size={16} /> {generationQuotaLabel(quota?.limit, quota?.remaining)}</span>
      </header>

      <nav className="flashcard-workspace-tabs" aria-label="Flashcard workspace">
        <button type="button" aria-pressed={mode === "study"} className={mode === "study" ? "is-active" : ""} onClick={() => { setMode("study"); setDeleteConfirmDeckId(null); }}><BookOpenCheck size={16} /> Study</button>
        <button type="button" aria-pressed={mode === "generate"} className={mode === "generate" ? "is-active" : ""} onClick={() => { setMode("generate"); setDeleteConfirmDeckId(null); }}><Sparkles size={16} /> Generate</button>
        <button type="button" aria-pressed={mode === "custom"} className={mode === "custom" ? "is-active" : ""} disabled={!canCreateCustomDeck} onClick={startCustom}><Plus size={16} /> Custom deck</button>
      </nav>

      {!canCreateCustomDeck && (
        <p className="flashcard-plan-note"><Layers3 size={16} /><span>Free accounts can generate and edit course-grounded decks. Custom deck creation is included with Plus and Pro.</span><Link href="/pricing">Compare plans</Link></p>
      )}
      {notice && <p className="flashcard-notice" role="status"><Check size={15} /> {notice}</p>}
      {error && <p className="form-error flashcard-page-error" role="alert"><CircleAlert size={15} /> {error}</p>}

      <div className="flashcard-library-layout">
        <aside className="deck-library-rail" aria-label="Your flashcard decks">
          <div><strong>Your decks</strong><span>{decks.length}</span></div>
          {decks.length ? decks.map((deck) => (
            <button key={deck.id} type="button" aria-pressed={selectedDeckId === deck.id} className={selectedDeckId === deck.id ? "is-active" : ""} onClick={() => { setSelectedDeckId(deck.id); setMode("study"); setNotice(null); setDeleteConfirmDeckId(null); }}>
              <span><strong>{deck.title}</strong><small>{deckScopeLabel(deck)} · {deck.cardCount} cards</small></span>
              <ChevronRight size={16} />
            </button>
          )) : (
            <div className="deck-library-empty"><Layers3 size={22} /><p>No decks yet. Generate one from a course when you are ready to study it.</p></div>
          )}
        </aside>

        <div className="flashcard-workspace">
          {mode === "study" && detail && detail.deck.id === selectedDeckId && (
            <>
              <header className="deck-detail-header">
                <div><span>{deckScopeLabel(detail.deck)}</span><h2>{detail.deck.title}</h2><p>{detail.deck.description || "A private deck in your learning library."}</p></div>
                <div>
                  <button className="button button-secondary button-small" type="button" onClick={startEditing}><FilePenLine size={15} /> Edit</button>
                  <button className={`button button-small ${deleteConfirmDeckId === detail.deck.id ? "button-danger" : "button-secondary"}`} type="button" onClick={() => void removeDeck()} disabled={busy}><Trash2 size={15} /> {deleteConfirmDeckId === detail.deck.id ? "Confirm remove" : "Remove"}</button>
                </div>
              </header>
              {deleteConfirmDeckId === detail.deck.id && <p className="deck-delete-note"><span>This removes the private deck and its review schedule.</span><button type="button" className="text-button" onClick={() => setDeleteConfirmDeckId(null)}>Cancel</button></p>}
              <FlashcardReviewer key={detail.deck.id} detail={detail} getToken={getToken} />
            </>
          )}
          {mode === "study" && selectedDeckId && (!detail || detail.deck.id !== selectedDeckId) && !error && (
            <div className="flashcard-studio-loading is-selection" aria-busy="true"><LoaderCircle className="spin" size={20} /> Loading the selected deck…</div>
          )}
          {mode === "study" && !selectedDeckId && (
            <div className="flashcard-workspace-empty"><span><Layers3 size={28} /></span><h2>Start with a course you want to remember.</h2><p>Decks are generated only on command. Filosage checks every card against the selected lesson material before saving it.</p><button className="button button-primary" type="button" onClick={() => { setMode("generate"); setDeleteConfirmDeckId(null); }}><Sparkles size={16} /> Generate your first deck</button></div>
          )}
          {mode === "generate" && (
            <section className="deck-generator" aria-labelledby="deck-generator-title">
              <header><h2 id="deck-generator-title">Generate from a course</h2><p>Recommended settings favor a compact mix of precise recall, distinctions, and application.</p></header>
              {!progress.length ? (
                <div className="generator-empty"><BookOpenCheck size={22} /><p>Start a course first. It will appear here as soon as Filosage has learning progress to ground the deck.</p><Link className="button button-secondary" href="/library">Explore courses</Link></div>
              ) : (
                <div className="generator-form">
                  <label>Course<select value={courseId} onChange={(event) => { setCourse(null); setCourseId(event.target.value); }}>{progress.map((item) => <option key={item.courseId} value={item.courseId}>{item.topic}</option>)}</select></label>
                  <fieldset><legend>Scope</legend><div className="segmented-control">{(["lesson", "module", "course"] as FlashcardScope[]).map((value) => <button key={value} type="button" aria-pressed={scope === value} className={scope === value ? "is-active" : ""} onClick={() => setScope(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></fieldset>
                  {scope === "lesson" && <label>Lesson<select value={lessonId} onChange={(event) => { setLessonId(event.target.value); const selected = lessons.find((item) => item.id === event.target.value); if (selected) setModuleIndex(selected.moduleIndex); }}>{lessons.map((item) => <option key={item.id} value={item.id}>{item.moduleTitle} — {item.title}</option>)}</select></label>}
                  {scope === "module" && <label>Module<select value={moduleIndex} onChange={(event) => setModuleIndex(Number(event.target.value))}>{course?.modules.map((item, index) => <option key={`${index}-${item.title}`} value={index}>{item.title}</option>)}</select></label>}
                  <div className="generator-pair">
                    <label>Depth<select value={depth} onChange={(event) => setDepth(event.target.value as FlashcardDepth)}><option value="focused">Focused</option><option value="balanced">Balanced · recommended</option><option value="comprehensive">Comprehensive</option></select></label>
                    <label>Emphasis<select value={emphasis} onChange={(event) => setEmphasis(event.target.value as FlashcardEmphasis)}><option value="balanced">Balanced · recommended</option><option value="key-ideas">Key ideas</option><option value="application">Application</option></select></label>
                  </div>
                  <div className="generator-check"><input id="include-attempted-checks" type="checkbox" checked={includeAttemptedChecks} onChange={(event) => setIncludeAttemptedChecks(event.target.checked)} /><label htmlFor="include-attempted-checks"><strong>Include attempted lesson checks</strong><small>Only checks you have already attempted can appear.</small></label></div>
                  <div className="generator-submit"><div><strong>{generationQuotaLabel(quota?.limit, quota?.remaining)}</strong><small>A successful generated preview uses one generation. Failed quality checks do not.</small></div><button className="button button-primary" type="button" disabled={busy || !course || !quota || quota.remaining === 0} onClick={() => void generateDeck()}>{busy ? <><LoaderCircle className="spin" size={15} /> Checking cards…</> : <><Sparkles size={16} /> Generate and check deck</>}</button></div>
                </div>
              )}
            </section>
          )}
          {(mode === "custom" || mode === "edit") && (
            <section className="deck-editor" aria-labelledby="deck-editor-title">
              <header><div><h2 id="deck-editor-title">{mode === "custom" ? "Create a custom deck" : "Edit this deck"}</h2><p>{mode === "custom" ? "Write one clear retrieval target per card." : "Keep prompts specific and answers short enough to recall."}</p></div>{mode === "edit" && detail?.deck.status === "draft" && <span><Archive size={15} /> Saving activates this draft</span>}</header>
              <label>Deck title<input value={editorTitle} onChange={(event) => setEditorTitle(event.target.value)} maxLength={120} placeholder="e.g. Core negotiation distinctions" /></label>
              <label>Description<textarea value={editorDescription} onChange={(event) => setEditorDescription(event.target.value)} maxLength={400} rows={2} placeholder="What should this deck help you retrieve?" /></label>
              <div className="deck-card-editor-list">
                {editorCards.map((card, index) => (
                  <fieldset key={card.localId}><legend>Card {index + 1}</legend><label>Prompt<textarea value={card.prompt} onChange={(event) => updateEditorCard(card.localId, { prompt: event.target.value })} maxLength={240} rows={2} placeholder="Ask one specific question" /></label><label>Answer<textarea value={card.answer} onChange={(event) => updateEditorCard(card.localId, { answer: event.target.value })} maxLength={600} rows={3} placeholder="Give the smallest complete answer" /></label><div><label>Card type<select value={card.type} onChange={(event) => updateEditorCard(card.localId, { type: event.target.value as FlashcardType })}><option value="recall">Recall</option><option value="contrast">Contrast</option><option value="misconception">Misconception</option><option value="application">Application</option></select></label><button className="text-button" type="button" disabled={editorCards.length === 1} onClick={() => setEditorCards((cards) => cards.filter((item) => item.localId !== card.localId))}><Trash2 size={14} /> Remove card</button></div></fieldset>
                ))}
              </div>
              {canCreateCustomDeck && <button className="deck-add-card" type="button" onClick={() => setEditorCards((cards) => [...cards, editableCard()])}><Plus size={16} /> Add another card</button>}
              <div className="deck-editor-actions"><button className="button button-secondary" type="button" onClick={() => setMode("study")}>Cancel</button><button className="button button-primary" type="button" disabled={busy} onClick={() => void saveEditor()}>{busy ? <><LoaderCircle className="spin" size={15} /> Saving…</> : mode === "custom" ? "Create custom deck" : "Save deck"}</button></div>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
