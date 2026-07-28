"use client";

import { useId, useState } from "react";
import type { LessonVisual } from "@/lib/lesson-visuals";

export default function LessonVisualRenderer({ visual }: { visual: LessonVisual }) {
  const wide = visual.type === "worked-example-trace" || visual.type === "prerequisite-map";
  const headingId = useId();

  return (
    <figure className={`lesson-visual lesson-visual-${visual.type} ${wide ? "lesson-visual-wide" : ""}`} data-lesson-visual={visual.type}>
      <figcaption className="lesson-visual-heading">
        <p className="overline">Visual explanation</p>
        <h2 id={headingId}>{visual.title}</h2>
        <p>{visual.summary}</p>
      </figcaption>
      {visual.type === "concept-contrast" && <ConceptContrast visual={visual} />}
      {visual.type === "process-flow" && <ProcessFlow visual={visual} />}
      {visual.type === "comparison-matrix" && <ComparisonMatrix visual={visual} headingId={headingId} />}
      {visual.type === "worked-example-trace" && <WorkedExampleTrace visual={visual} />}
      {visual.type === "prerequisite-map" && <PrerequisiteMap visual={visual} />}
    </figure>
  );
}

function ConceptContrast({ visual }: { visual: Extract<LessonVisual, { type: "concept-contrast" }> }) {
  return (
    <div className="visual-contrast" aria-label="Concept contrast">
      <section><p>Tempting shortcut</p><strong>{visual.misconception}</strong></section>
      <section><p>More accurate view</p><strong>{visual.accurateView}</strong></section>
      <p className="visual-why"><strong>Why this matters:</strong> {visual.whyItMatters}</p>
    </div>
  );
}

function ProcessFlow({ visual }: { visual: Extract<LessonVisual, { type: "process-flow" }> }) {
  return (
    <ol className="visual-flow">
      {visual.steps.map((step, index) => (
        <li key={`${step.title}-${index}`}>
          <span aria-hidden="true">{index + 1}</span>
          <div><strong>{step.title}</strong><p>{step.detail}</p></div>
        </li>
      ))}
    </ol>
  );
}

function ComparisonMatrix({ visual, headingId }: { visual: Extract<LessonVisual, { type: "comparison-matrix" }>; headingId: string }) {
  return (
    <div className="visual-matrix-wrap" role="region" aria-labelledby={headingId} tabIndex={0}>
      <table className="visual-matrix">
        <caption className="sr-only">{visual.title}: {visual.columns[0]} compared with {visual.columns[1]}</caption>
        <thead><tr><th scope="col">Lens</th><th scope="col">{visual.columns[0]}</th><th scope="col">{visual.columns[1]}</th></tr></thead>
        <tbody>{visual.rows.map((row, index) => <tr key={`${row.criterion}-${index}`}><th scope="row">{row.criterion}</th><td>{row.values[0]}</td><td>{row.values[1]}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function WorkedExampleTrace({ visual }: { visual: Extract<LessonVisual, { type: "worked-example-trace" }> }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = visual.steps[activeIndex] ?? visual.steps[0];
  return (
    <section className="visual-trace" aria-label="Worked example reasoning trace">
      <p className="visual-trace-prompt">{visual.prompt}</p>
      <div className="visual-trace-layout">
        <ol>{visual.steps.map((step, index) => <li key={`${step.title}-${index}`}><button type="button" aria-current={index === activeIndex ? "step" : undefined} onClick={() => setActiveIndex(index)}><span>{index + 1}</span>{step.title}</button></li>)}</ol>
        <div className="visual-trace-detail" aria-live="polite"><p className="overline">Reasoning step {activeIndex + 1}</p><h3>{active.title}</h3><p>{active.detail}</p><p><strong>Check:</strong> {active.check}</p></div>
      </div>
    </section>
  );
}

function PrerequisiteMap({ visual }: { visual: Extract<LessonVisual, { type: "prerequisite-map" }> }) {
  return (
    <ol className="visual-prerequisite-map" aria-label="Learning sequence">
      {visual.nodes.map((node, index) => (
        <li className={`is-${node.role}`} key={`${node.role}-${node.label}-${index}`}>
          {index > 0 && <span className="visual-map-connector" aria-hidden="true">Then</span>}
          <p>{node.role === "foundation" ? "Foundation" : node.role === "current" ? "This lesson" : "Next use"}</p>
          <strong>{node.label}</strong><small>{node.detail}</small>
        </li>
      ))}
    </ol>
  );
}
