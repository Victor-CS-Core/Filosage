"use client";

import { useState } from "react";
import { Check, RotateCcw, Sparkles } from "lucide-react";
import type { FlashcardDeckDetail, FlashcardRating } from "@/lib/flashcards";

interface FlashcardReviewerProps {
  detail: FlashcardDeckDetail;
  getToken: () => Promise<string>;
}

export default function FlashcardReviewer({ detail, getToken }: FlashcardReviewerProps) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const card = detail.cards[index];

  const rate = async (rating: FlashcardRating) => {
    if (!card || saving) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const response = await fetch(`/api/flashcards/decks/${encodeURIComponent(detail.deck.id)}/review`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, rating }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "This recall rating could not be saved.");
      if (index >= detail.cards.length - 1) {
        setComplete(true);
      } else {
        setIndex((current) => current + 1);
        setRevealed(false);
      }
    } catch (ratingError) {
      setError(ratingError instanceof Error ? ratingError.message : "This recall rating could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  if (!detail.cards.length) {
    return <div className="deck-study-empty"><strong>This deck has no active cards.</strong><p>Add or restore a card before starting recall.</p></div>;
  }

  if (complete) {
    return (
      <div className="deck-study-complete" role="status">
        <span><Check size={22} /></span>
        <div><strong>Deck complete</strong><p>Your ratings are saved and the next review dates are scheduled.</p></div>
        <button className="button button-secondary" type="button" onClick={() => { setIndex(0); setRevealed(false); setComplete(false); }}><RotateCcw size={15} /> Review again</button>
      </div>
    );
  }

  return (
    <section className="deck-study" aria-label={`Study ${detail.deck.title}`}>
      <div className="deck-study-progress">
        <span>Card {index + 1} of {detail.cards.length}</span>
        <span>{Math.round(((index + 1) / detail.cards.length) * 100)}%</span>
      </div>
      <button
        className={`deck-study-card${revealed ? " is-revealed" : ""}`}
        type="button"
        onClick={() => setRevealed((current) => !current)}
        aria-pressed={revealed}
      >
        <span>{revealed ? "Answer" : "Prompt"}</span>
        <strong>{revealed ? card.answer : card.prompt}</strong>
        {revealed && card.sourceRefs.length > 0 && (
          <small>Grounded in {Array.from(new Set(card.sourceRefs.map((source) => source.lessonTitle))).join(", ")}</small>
        )}
        <em>{revealed ? "Rate what you recalled" : "Think before you reveal"}</em>
      </button>
      {!revealed ? (
        <button className="button button-primary deck-reveal-button" type="button" onClick={() => setRevealed(true)}><Sparkles size={15} /> Reveal answer</button>
      ) : (
        <div className="deck-rating-controls" aria-label="Rate your recall">
          <button type="button" disabled={saving} onClick={() => void rate("again")}><span>Again</span><small>Review tomorrow</small></button>
          <button type="button" disabled={saving} onClick={() => void rate("almost")}><span>Almost</span><small>Short interval</small></button>
          <button type="button" disabled={saving} onClick={() => void rate("got-it")}><span>Got it</span><small>Longer interval</small></button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
