"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Check, CircleDot, Headphones, RefreshCw, Sparkles, Volume2 } from "lucide-react";
import type {
  InteractionEvidence,
  LessonInteraction,
} from "@/lib/lesson-interactions";

type RecognitionInteraction = Extract<LessonInteraction, { type: "recognition" }>;

function recognitionEvidence(
  interaction: RecognitionInteraction,
  itemResults: InteractionEvidence["itemResults"],
): InteractionEvidence {
  return {
    interactionId: interaction.id,
    itemCount: interaction.items.length,
    minimumFirstAttemptCorrect: interaction.mastery.minimumFirstAttemptCorrect,
    firstAttemptCorrect: itemResults.filter((item) => item.firstAttemptCorrect).length,
    attempts: itemResults.reduce((sum, item) => sum + item.attempts, 0),
    completed: itemResults.length === interaction.items.length && itemResults.every((item) => item.mastered),
    itemResults,
  };
}

function RecognitionLab({
  interaction,
  evidence,
  onProgress,
  verifyAnswer,
}: {
  interaction: RecognitionInteraction;
  evidence?: InteractionEvidence;
  onProgress?: (evidence: InteractionEvidence) => void;
  verifyAnswer?: (itemId: string, selectedIndex: number) => Promise<{
    correct: boolean;
    attempts: number;
    firstAttemptCorrect: boolean;
    receipt?: string;
  }>;
}) {
  const existingResults = evidence?.interactionId === interaction.id ? evidence.itemResults : [];
  const resultByItemId = new Map(existingResults.map((result) => [result.itemId, result]));
  const firstUnattemptedIndex = interaction.items.findIndex((item) => !resultByItemId.has(item.id));
  const firstMissedIndex = interaction.items.findIndex((item) => !resultByItemId.get(item.id)?.mastered);
  const suggestedIndex = firstUnattemptedIndex >= 0 ? firstUnattemptedIndex : Math.max(0, firstMissedIndex);
  const [activeIndex, setActiveIndex] = useState(suggestedIndex);
  const [selected, setSelected] = useState<{ index: number; correct: boolean } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const item = interaction.items[Math.min(activeIndex, interaction.items.length - 1)];
  const firstPassComplete = interaction.items.every((candidate) => resultByItemId.has(candidate.id));
  const complete = evidence?.interactionId === interaction.id && evidence.completed;
  const firstAttemptCorrect = evidence?.interactionId === interaction.id ? evidence.firstAttemptCorrect : 0;

  const choose = async (choiceIndex: number) => {
    if (selected || checking || complete) return;
    setChecking(true);
    setError(null);
    try {
      const previous = resultByItemId.get(item.id);
      const localCorrect = choiceIndex === item.correctIndex;
      const verified = verifyAnswer
        ? await verifyAnswer(item.id, choiceIndex)
        : {
            correct: localCorrect,
            attempts: (previous?.attempts ?? 0) + 1,
            firstAttemptCorrect: previous?.firstAttemptCorrect ?? (!previous && localCorrect),
            receipt: undefined,
          };
      const itemResult = {
        itemId: item.id,
        attempts: verified.attempts,
        firstAttemptCorrect: verified.firstAttemptCorrect,
        mastered: previous?.mastered === true || verified.correct,
        receipt: verified.receipt ?? previous?.receipt,
      };
      const itemResults = [
        ...existingResults.filter((result) => result.itemId !== item.id),
        itemResult,
      ];
      onProgress?.(recognitionEvidence(interaction, itemResults));
      setSelected({ index: choiceIndex, correct: verified.correct });
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "This response could not be checked.");
    } finally {
      setChecking(false);
    }
  };

  const continueSession = () => {
    const updatedResults = new Map((evidence?.itemResults ?? []).map((result) => [result.itemId, result]));
    const nextUnattempted = interaction.items.findIndex((candidate) => !updatedResults.has(candidate.id));
    const nextMissed = interaction.items.findIndex((candidate, index) => index !== activeIndex && !updatedResults.get(candidate.id)?.mastered);
    if (nextUnattempted >= 0) setActiveIndex(nextUnattempted);
    else if (nextMissed >= 0) setActiveIndex(nextMissed);
    setSelected(null);
  };

  if (complete && !selected) {
    const metThreshold = firstAttemptCorrect >= interaction.mastery.minimumFirstAttemptCorrect;
    return <div className="recognition-lab is-complete" role="status">
      <div className="recognition-summary-mark"><Check size={22} /></div>
      <div>
        <strong>{metThreshold ? "First-pass target met" : "Practice round complete"}</strong>
        <p>You identified {firstAttemptCorrect} of {interaction.items.length} correctly on the first response and corrected every missed item.</p>
      </div>
    </div>;
  }

  const completedItems = existingResults.filter((result) => result.mastered).length;
  return <div className="recognition-lab">
    <div className="recognition-session-status">
      <span>{firstPassComplete ? "Focused retry" : `First pass ${Math.min(existingResults.length + 1, interaction.items.length)} of ${interaction.items.length}`}</span>
      <span>{completedItems} mastered</span>
    </div>
    <div className="practice-sequence-track" role="progressbar" aria-label="Recognition lab progress" aria-valuemin={0} aria-valuemax={interaction.items.length} aria-valuenow={completedItems}>
      <span style={{ transform: `scaleX(${completedItems / interaction.items.length})` }} />
    </div>
    <section className="recognition-card" aria-labelledby={`${item.id}-prompt`}>
      <div className="recognition-stimulus">
        <small>{item.difficulty === "foundation" ? "Build recognition" : item.difficulty === "contrast" ? "Distinguish a close pattern" : "Transfer"}</small>
        <code aria-label={item.stimulus.accessibleLabel}>{item.stimulus.value}</code>
      </div>
      <h3 id={`${item.id}-prompt`}>{item.stimulus.kind === "signal"
        ? "Which character does this complete pattern represent?"
        : "Which response best applies the target skill in this situation?"}</h3>
      <div className="recognition-choices">
        {item.choices.map((choice, choiceIndex) => {
          const isSelected = selected?.index === choiceIndex;
          return <button
            key={`${item.id}-${choice.label}`}
            type="button"
            className={`${isSelected ? "is-selected" : ""} ${isSelected && selected?.correct ? "is-correct" : ""} ${isSelected && !selected?.correct ? "is-incorrect" : ""}`}
            disabled={Boolean(selected) || checking}
            aria-pressed={isSelected}
            onClick={() => void choose(choiceIndex)}
          >
            <span>{String.fromCharCode(65 + choiceIndex)}</span>
            <strong>{choice.label}</strong>
          </button>;
        })}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {selected && <div className={`recognition-feedback ${selected.correct ? "is-correct" : "is-incorrect"}`} aria-live="polite">
        <strong>{selected.correct ? "Correct" : `Correct answer: ${item.choices[item.correctIndex].label}`}</strong>
        <p>{item.choices[selected.index].feedback}</p>
        <button className="button button-primary button-small" type="button" onClick={continueSession}>
          {selected.correct || !firstPassComplete ? "Continue" : "Try this pattern again"} <ArrowRight size={15} />
        </button>
      </div>}
    </section>
    <p className="recognition-target">First-pass target: {interaction.mastery.minimumFirstAttemptCorrect} of {interaction.items.length}. Answers stay hidden until you commit.</p>
  </div>;
}

function ClassificationLab({ interaction }: { interaction: Extract<LessonInteraction, { type: "classification" }> }) {
  const [answers, setAnswers] = useState<number[]>(() => interaction.items.map(() => -1));
  const [checked, setChecked] = useState(false);
  const complete = answers.every((answer) => answer >= 0);
  const correct = answers.filter((answer, index) => answer === interaction.items[index].groupIndex).length;

  return <div className="classification-lab">
    <div className="classification-items">
      {interaction.items.map((item, itemIndex) => <article key={`${item.label}-${itemIndex}`}>
        <strong>{item.label}</strong>
        <div role="group" aria-label={`Classify ${item.label}`}>
          {interaction.groups.map((group, groupIndex) => <button key={group} type="button" aria-pressed={answers[itemIndex] === groupIndex} className={answers[itemIndex] === groupIndex ? "is-selected" : ""} onClick={() => { setChecked(false); setAnswers((current) => current.map((answer, index) => index === itemIndex ? groupIndex : answer)); }}>{group}</button>)}
        </div>
        {checked && <p className={answers[itemIndex] === item.groupIndex ? "is-correct" : "is-incorrect"}>{item.explanation}</p>}
      </article>)}
    </div>
    <div className="interaction-actions">
      <button className="button button-primary" type="button" disabled={!complete} onClick={() => setChecked(true)}><Check size={15} /> Check classification</button>
      {checked && <span role="status">{correct} of {interaction.items.length} placed correctly.</span>}
    </div>
  </div>;
}

function SequenceLab({ interaction }: { interaction: Extract<LessonInteraction, { type: "sequence" }> }) {
  const initial = useMemo(() => {
    const mixed: number[] = [];
    let start = 0;
    let end = interaction.steps.length - 1;
    while (start <= end) {
      if (end >= start) mixed.push(end--);
      if (start <= end) mixed.push(start++);
    }
    return mixed;
  }, [interaction.steps]);
  const [order, setOrder] = useState(initial);
  const [checked, setChecked] = useState(false);
  const move = (position: number, direction: -1 | 1) => {
    const destination = position + direction;
    if (destination < 0 || destination >= order.length) return;
    setChecked(false);
    setOrder((current) => {
      const next = [...current];
      [next[position], next[destination]] = [next[destination], next[position]];
      return next;
    });
  };
  const correct = order.every((originalIndex, position) => originalIndex === position);

  return <div className="sequence-lab">
    <ol>
      {order.map((stepIndex, position) => <li key={stepIndex}>
        <span>{position + 1}</span>
        <div>{interaction.steps[stepIndex].label !== "Action" && <strong>{interaction.steps[stepIndex].label}</strong>}<p>{interaction.steps[stepIndex].detail}</p></div>
        <div className="sequence-controls">
          <button type="button" onClick={() => move(position, -1)} disabled={position === 0} aria-label={`Move action at position ${position + 1} up`}><ArrowUp size={15} /></button>
          <button type="button" onClick={() => move(position, 1)} disabled={position === order.length - 1} aria-label={`Move action at position ${position + 1} down`}><ArrowDown size={15} /></button>
        </div>
      </li>)}
    </ol>
    <div className="interaction-actions">
      <button className="button button-primary" type="button" onClick={() => setChecked(true)}><Check size={15} /> Check order</button>
      <button className="button button-quiet" type="button" onClick={() => { setOrder(initial); setChecked(false); }}><RefreshCw size={14} /> Reset</button>
      {checked && <span className={correct ? "is-correct" : "is-incorrect"} role="status">{correct ? "That sequence is ready to use." : "Not quite. Trace what each step needs from the one before it."}</span>}
    </div>
  </div>;
}

function ScenarioLab({ interaction }: { interaction: Extract<LessonInteraction, { type: "scenario" }> }) {
  const [selected, setSelected] = useState<number | null>(null);
  return <div className="scenario-lab">
    <div className="scenario-options">
      {interaction.options.map((option, index) => <button type="button" key={option.label} aria-pressed={selected === index} className={selected === index ? "is-selected" : ""} onClick={() => setSelected(index)}><span>{String.fromCharCode(65 + index)}</span><strong>{option.label}</strong></button>)}
    </div>
    {selected !== null && <div className="scenario-result" role="status"><strong>{selected === interaction.recommendedIndex ? "A defensible choice" : "Follow the consequence"}</strong><p>{interaction.options[selected].consequence}</p><p>{interaction.explanation}</p></div>}
  </div>;
}

function signalUnits(value: string) {
  return value.split("").map((character) => character === "." ? 1 : character === "-" ? 3 : character === "/" ? 7 : 1);
}

async function playSignal(value: string) {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("Audio is not supported in this browser.");
  const context = new AudioContextClass();
  await context.resume();
  const unit = 0.09;
  let cursor = context.currentTime + 0.05;
  for (const character of value) {
    if (character === "." || character === "-") {
      const duration = character === "." ? unit : unit * 3;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 620;
      gain.gain.setValueAtTime(0.0001, cursor);
      gain.gain.exponentialRampToValueAtTime(0.16, cursor + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, cursor + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(cursor);
      oscillator.stop(cursor + duration + 0.02);
      cursor += duration + unit;
    } else cursor += character === "/" ? unit * 6 : unit * 2;
  }
  window.setTimeout(() => void context.close(), Math.ceil((cursor - context.currentTime + 0.2) * 1000));
}

function SignalLab({ interaction }: { interaction: Extract<LessonInteraction, { type: "signal" }> }) {
  const [selected, setSelected] = useState(0);
  const [composition, setComposition] = useState("");
  const [status, setStatus] = useState("Ready to play.");
  const selectedPattern = interaction.patterns[selected];
  const play = async (value: string, label: string) => {
    try { setStatus(`Playing ${label}.`); await playSignal(value); } catch (error) { setStatus(error instanceof Error ? error.message : "Audio could not be played."); }
  };
  return <div className="signal-lab">
    <div className="signal-pattern-picker" role="group" aria-label="Signal patterns">
      {interaction.patterns.map((pattern, index) => <button type="button" aria-pressed={selected === index} className={selected === index ? "is-selected" : ""} key={`${pattern.label}-${pattern.value}`} onClick={() => setSelected(index)}><strong>{pattern.label}</strong><code>{pattern.value}</code></button>)}
    </div>
    <div className="signal-stage">
      <div className="signal-stage-heading"><span><Headphones size={17} /> Timing strip</span><button className="button button-secondary button-small" type="button" onClick={() => void play(selectedPattern.value, selectedPattern.label)}><Volume2 size={15} /> Play signal</button></div>
      <div className="signal-timeline" aria-label={`${selectedPattern.label}: ${selectedPattern.value}`}>
        {selectedPattern.value.split("").map((character, index) => <i key={index} className={character === "." ? "is-dot" : character === "-" ? "is-dash" : "is-gap"} style={{ "--signal-units": signalUnits(character)[0] } as CSSProperties}><span>{character === " " ? "gap" : character}</span></i>)}
      </div>
      <div className="signal-composer">
        <span>Build your own</span>
        <code aria-live="polite">{composition || "Choose dot or dash"}</code>
        <div><button type="button" onClick={() => setComposition((value) => `${value}.`)}>Dot ·</button><button type="button" onClick={() => setComposition((value) => `${value}-`)}>Dash −</button><button type="button" onClick={() => setComposition("")} disabled={!composition}>Clear</button><button type="button" onClick={() => void play(composition, "your signal")} disabled={!composition}><Volume2 size={14} /> Play mine</button></div>
      </div>
      <span className="sr-only" role="status">{status}</span>
    </div>
  </div>;
}

export default function InteractiveLessonBlock({
  interaction,
  evidence,
  onProgress,
  verifyRecognitionAnswer,
}: {
  interaction: LessonInteraction;
  evidence?: InteractionEvidence;
  onProgress?: (evidence: InteractionEvidence) => void;
  verifyRecognitionAnswer?: (itemId: string, selectedIndex: number) => Promise<{
    correct: boolean;
    attempts: number;
    firstAttemptCorrect: boolean;
    receipt?: string;
  }>;
}) {
  return <section className="interactive-lesson-block" aria-labelledby={`${interaction.id}-title`}>
    <header><span className="interactive-block-icon"><Sparkles size={19} /></span><div><p className="overline">{interaction.purpose === "practice" ? "Practice lab" : "Interactive explorer"}</p><h2 id={`${interaction.id}-title`}>{interaction.title}</h2><p>{interaction.summary}</p></div></header>
    <p className="interactive-prompt"><CircleDot size={17} /> {interaction.prompt}</p>
    {interaction.type === "recognition" && <RecognitionLab interaction={interaction} evidence={evidence} onProgress={onProgress} verifyAnswer={verifyRecognitionAnswer} />}
    {interaction.type === "classification" && <ClassificationLab interaction={interaction} />}
    {interaction.type === "sequence" && <SequenceLab interaction={interaction} />}
    {interaction.type === "scenario" && <ScenarioLab interaction={interaction} />}
    {interaction.type === "signal" && <SignalLab interaction={interaction} />}
  </section>;
}
