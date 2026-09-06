"use client";

import { Check, CheckCircle2, FileText, FlaskConical, Scale, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { LessonExperience as LessonExperienceData } from "@/lib/course-types";
import { normalizeStructuredMarkdown } from "@/lib/markdown";

const titles: Record<LessonExperienceData["type"], string> = {
  concept: "Predict, then refine your model",
  "worked-example": "Follow the expert reasoning",
  comparison: "Decide with explicit criteria",
  "case-study": "Make sense of the evidence",
  "practice-lab": "Build the lesson artifact",
  synthesis: "Connect the course into one decision",
};

const responseLabels: Record<LessonExperienceData["type"], string> = {
  concept: "Your prediction",
  "worked-example": "Your unsupported finish",
  comparison: "Your boundary-case decision",
  "case-study": "Your decision",
  "practice-lab": "Your artifact record",
  synthesis: "Your reflection",
};

export interface LessonExperienceState {
  type: LessonExperienceData["type"];
  response: string;
  completed: boolean;
}

const RESERVED_EXPERIENCE_TASKS = new Set(["artifactprompt", "successcriteria"]);

function isReservedExperienceTask(value: string) {
  return RESERVED_EXPERIENCE_TASKS.has(value.trim().toLowerCase().replace(/[^a-z]/g, ""));
}

function StructuredText({ value, className = "" }: { value: string; className?: string }) {
  return (
    <div className={`structured-markdown experience-markdown ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeStructuredMarkdown(value)}</ReactMarkdown>
    </div>
  );
}

function EvidenceComposer({
  experience,
  prompt,
  placeholder,
  value,
  onChange,
  submitLabel,
}: {
  experience: LessonExperienceData;
  prompt: string;
  placeholder: string;
  value: LessonExperienceState;
  onChange: (value: LessonExperienceState) => void;
  submitLabel: string;
}) {
  const meaningful = value.response.trim().length >= 20;
  return (
    <div className="experience-composer">
      <label htmlFor="experience-response">{responseLabels[experience.type]}</label>
      <StructuredText value={prompt} className="experience-composer-prompt" />
      <textarea
        id="experience-response"
        rows={4}
        maxLength={8_000}
        value={value.response}
        onChange={(event) => onChange({ type: experience.type, response: event.target.value, completed: false })}
        placeholder={placeholder}
        aria-describedby="experience-draft-status experience-privacy"
      />
      <div className="experience-submit-row">
        <button
          className="button button-secondary button-small"
          type="button"
          disabled={!meaningful}
          onClick={() => onChange({ ...value, type: experience.type, response: value.response.trim(), completed: true })}
        >
          {value.completed ? <CheckCircle2 size={15} /> : null}{value.completed ? "Activity evidence saved" : submitLabel}
        </button>
        <small id="experience-draft-status" role="status">
          {value.completed ? "Ready for lesson completion." : value.response.trim() ? "Write at least 20 characters, then save this attempt." : "A meaningful attempt is required."}
        </small>
      </div>
    </div>
  );
}

export default function LessonExperience({
  experience,
  value,
  onChange,
  deviceSaved,
}: {
  experience: LessonExperienceData;
  value: LessonExperienceState;
  onChange: (value: LessonExperienceState) => void;
  deviceSaved?: boolean | null;
}) {
  return (
    <section className={`lesson-experience experience-${experience.type}`} aria-labelledby="lesson-experience-title">
      <header>
        <span aria-hidden="true"><Sparkles size={18} /></span>
        <div><p>Active lesson</p><h2 id="lesson-experience-title">{titles[experience.type]}</h2></div>
      </header>

      {experience.type === "concept" && <>
        <EvidenceComposer
          experience={experience}
          prompt={experience.predictionPrompt}
          placeholder="Record your first prediction before seeing the model."
          value={value}
          onChange={onChange}
          submitLabel="Reveal the mental model"
        />
        {value.completed && <div className="experience-reveal" aria-live="polite">
          <h3>{experience.mentalModel.title}</h3>
          <ol>{experience.mentalModel.parts.map((part) => <li key={part.label}><strong>{part.label}</strong><span>{part.role}</span></li>)}</ol>
          <div className="experience-correction"><strong>Test the misconception</strong><p>{experience.misconceptionCheck.claim}</p><span>{experience.misconceptionCheck.correction}</span></div>
        </div>}
      </>}

      {experience.type === "worked-example" && <>
        <p className="experience-brief">{experience.scenario}</p>
        <ol className="reasoning-trace">{experience.steps.map((step, index) => <li key={`${step.title}-${index}`}><span>{index + 1}</span><div><strong>{step.title}</strong><p>{step.reasoning}</p><small>Result: {step.output}</small></div></li>)}</ol>
        <EvidenceComposer
          experience={experience}
          prompt={experience.fadingPrompt}
          placeholder="Finish the next step in your own words, with less support."
          value={value}
          onChange={onChange}
          submitLabel="Save unsupported finish"
        />
      </>}

      {experience.type === "comparison" && <>
        <div className="experience-table-wrap"><table><caption>Criteria for {experience.options[0]} and {experience.options[1]}</caption><thead><tr><th>Criterion</th><th>{experience.options[0]}</th><th>{experience.options[1]}</th></tr></thead><tbody>{experience.criteria.map((row) => <tr key={row.criterion}><th scope="row">{row.criterion}</th><td>{row.first}</td><td>{row.second}</td></tr>)}</tbody></table></div>
        <div className="experience-challenge"><h3><Scale size={16} aria-hidden="true" /> Resolve the boundary case</h3>
          <EvidenceComposer
            experience={experience}
            prompt={experience.boundaryCase.prompt}
            placeholder="Choose an option and defend the boundary you used."
            value={value}
            onChange={onChange}
            submitLabel="Compare with the resolution"
          />
          {value.completed && <div className="experience-resolution" aria-live="polite"><strong>Reasoned resolution</strong><span>{experience.boundaryCase.resolution}</span></div>}
        </div>
      </>}

      {experience.type === "case-study" && <>
        <p className="experience-brief">{experience.brief}</p>
        <div className="evidence-packet" aria-label="Case evidence">{experience.evidence.map((item) => <article key={item.label}><FileText size={17} aria-hidden="true" /><strong>{item.label}</strong><p>{item.detail}</p></article>)}</div>
        <EvidenceComposer
          experience={experience}
          prompt={experience.decisionPrompt}
          placeholder="State the interpretation you favor and the evidence that supports it."
          value={value}
          onChange={onChange}
          submitLabel="Compare interpretations"
        />
        {value.completed && <ul className="experience-interpretations" aria-live="polite">{experience.interpretations.map((item) => <li key={item}><Check size={15} aria-hidden="true" /><span>{item}</span></li>)}</ul>}
      </>}

      {experience.type === "practice-lab" && <>
        <StructuredText value={experience.brief} className="experience-brief" />
        <div className="lab-layout"><section><h3><FlaskConical size={17} aria-hidden="true" /> Materials</h3><ul>{experience.materials.map((item) => <li key={item}><StructuredText value={item} /></li>)}</ul></section><section><h3>Build sequence</h3><ol>{experience.tasks.filter((item) => !isReservedExperienceTask(item)).map((item) => <li key={item}><StructuredText value={item} /></li>)}</ol></section></div>
        <div className="artifact-prompt"><strong>Artifact to produce</strong><StructuredText value={experience.artifactPrompt} /><ul>{experience.successCriteria.map((item) => <li key={item}><StructuredText value={item} /></li>)}</ul></div>
        <EvidenceComposer
          experience={experience}
          prompt="Record what you produced, where it is saved, and which success criterion you checked."
          placeholder="Describe the artifact or paste a concise working excerpt."
          value={value}
          onChange={onChange}
          submitLabel="Save artifact evidence"
        />
      </>}

      {experience.type === "synthesis" && <>
        <p className="experience-brief">{experience.challenge}</p>
        <div className="connection-map">{experience.connections.map((item) => <article key={item.concept}><strong>{item.concept}</strong><p>{item.contribution}</p></article>)}</div>
        <div className="artifact-prompt"><strong>Capstone increment</strong><p>{experience.capstoneContribution}</p></div>
        <EvidenceComposer
          experience={experience}
          prompt={experience.reflectionPrompt}
          placeholder="Explain how the pieces change your final work."
          value={value}
          onChange={onChange}
          submitLabel="Save synthesis evidence"
        />
      </>}

      <small className="experience-privacy" id="experience-privacy">{deviceSaved === false ? "This browser could not save your draft. Keep this page open and copy your response before leaving." : "Drafts are saved on this device. When you complete the lesson, this response becomes part of your private learning evidence and is never sent to the tutor."}</small>
    </section>
  );
}
