"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, LockKeyhole, RotateCcw, X } from "lucide-react";
import {
  cloneDashboardPreferences,
  DASHBOARD_METRICS,
  DASHBOARD_PRESETS,
  type DashboardMainSection,
  type DashboardMetric,
  type DashboardPreferences,
  type DashboardPreset,
  type DashboardSideSection,
} from "@/lib/dashboard-preferences";

const presetDetails: Array<{ id: Exclude<DashboardPreset, "custom">; label: string; description: string }> = [
  { id: "default", label: "Default", description: "A balanced learning overview." },
  { id: "focused", label: "Focused", description: "Only the next useful actions." },
  { id: "progress", label: "Progress", description: "Mastery and momentum first." },
  { id: "discover", label: "Discover", description: "Recommendations and exploration." },
];

const sectionLabels: Record<DashboardMainSection | DashboardSideSection, string> = {
  nextUp: "Next up",
  achievements: "Achievements",
  learningTip: "Learning tip",
  snapshot: "Learning snapshot",
  quickActions: "Quick actions",
};

const metricLabels: Record<DashboardMetric, string> = {
  studyTime: "Study time",
  lessons: "Lessons learned",
  streak: "Current streak",
  accuracy: "Quiz accuracy",
  mastered: "Concepts mastered",
};

interface DashboardCustomizerProps {
  open: boolean;
  preferences: DashboardPreferences;
  syncStatus: "idle" | "saving" | "saved" | "error";
  onClose: () => void;
  onSave: (preferences: DashboardPreferences) => void;
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export default function DashboardCustomizer({ open, preferences, syncStatus, onClose, onSave }: DashboardCustomizerProps) {
  const [draft, setDraft] = useState(() => cloneDashboardPreferences(preferences));
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => { document.body.style.overflow = originalOverflow; };
  }, [open]);

  if (!open) return null;

  const toggleSection = (key: DashboardMainSection | DashboardSideSection) => {
    setDraft((current) => ({
      ...current,
      preset: "custom",
      sections: { ...current.sections, [key]: !current.sections[key] },
    }));
  };

  const toggleMetric = (key: DashboardMetric) => {
    setDraft((current) => {
      const visibleCount = DASHBOARD_METRICS.filter((metric) => current.metrics[metric]).length;
      if (current.metrics[key] && visibleCount === 1) return current;
      return { ...current, preset: "custom", metrics: { ...current.metrics, [key]: !current.metrics[key] } };
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") onClose();
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const sectionRow = (key: DashboardMainSection | DashboardSideSection, index: number, order: Array<DashboardMainSection | DashboardSideSection>, group: "main" | "side") => (
    <li key={key}>
      <button className="visibility-toggle" type="button" role="switch" aria-checked={draft.sections[key]} onClick={() => toggleSection(key)}>
        {draft.sections[key] ? <Eye size={17} /> : <EyeOff size={17} />}
        <span>{sectionLabels[key]}</span>
      </button>
      <span className="order-controls">
        <button type="button" aria-label={`Move ${sectionLabels[key]} up`} disabled={index === 0} onClick={() => setDraft((current) => ({ ...current, preset: "custom", [group === "main" ? "mainOrder" : "sideOrder"]: moveItem(group === "main" ? current.mainOrder : current.sideOrder, index, -1) }))}><ArrowUp size={15} /></button>
        <button type="button" aria-label={`Move ${sectionLabels[key]} down`} disabled={index === order.length - 1} onClick={() => setDraft((current) => ({ ...current, preset: "custom", [group === "main" ? "mainOrder" : "sideOrder"]: moveItem(group === "main" ? current.mainOrder : current.sideOrder, index, 1) }))}><ArrowDown size={15} /></button>
      </span>
    </li>
  );

  return (
    <div className="dashboard-customizer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} className="dashboard-customizer" role="dialog" aria-modal="true" aria-labelledby="customizer-title" onKeyDown={handleKeyDown}>
        <header>
          <div><p className="overline">Your dashboard</p><h2 id="customizer-title">Choose what helps you focus.</h2><p>Hide distractions, surface useful progress, and change the order of supporting sections.</p></div>
          <button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label="Close dashboard settings"><X size={19} /></button>
        </header>

        <div className="customizer-scroll">
          <section className="customizer-group" aria-labelledby="preset-title">
            <div className="customizer-group-heading"><h3 id="preset-title">Start with a view</h3><span>{draft.preset === "custom" ? "Custom" : presetDetails.find((item) => item.id === draft.preset)?.label}</span></div>
            <div className="preset-options">
              {presetDetails.map((preset) => <button type="button" key={preset.id} className={draft.preset === preset.id ? "is-selected" : ""} onClick={() => setDraft(cloneDashboardPreferences(DASHBOARD_PRESETS[preset.id]))}><span>{draft.preset === preset.id && <Check size={14} />}</span><strong>{preset.label}</strong><small>{preset.description}</small></button>)}
            </div>
          </section>

          <section className="customizer-group" aria-labelledby="sections-title">
            <div className="customizer-group-heading"><h3 id="sections-title">Sections</h3><span>Show and order</span></div>
            <div className="fixed-dashboard-section"><LockKeyhole size={16} /><span><strong>Continue learning</strong><small>Always visible so your course is one step away.</small></span></div>
            <h4>Main column</h4>
            <ul className="customizer-list">{draft.mainOrder.map((key, index) => sectionRow(key, index, draft.mainOrder, "main"))}</ul>
            <h4>Side column</h4>
            <ul className="customizer-list">{draft.sideOrder.map((key, index) => sectionRow(key, index, draft.sideOrder, "side"))}</ul>
          </section>

          <section className="customizer-group" aria-labelledby="metrics-title">
            <div className="customizer-group-heading"><h3 id="metrics-title">Snapshot metrics</h3><span>Keep at least one</span></div>
            <div className="metric-toggles">
              {DASHBOARD_METRICS.map((metric) => <button key={metric} type="button" role="switch" aria-checked={draft.metrics[metric]} className={draft.metrics[metric] ? "is-selected" : ""} onClick={() => toggleMetric(metric)}><span>{draft.metrics[metric] && <Check size={13} />}</span>{metricLabels[metric]}</button>)}
            </div>
          </section>
        </div>

        <footer>
          <button className="button button-quiet" type="button" onClick={() => setDraft(cloneDashboardPreferences(DASHBOARD_PRESETS.default))}><RotateCcw size={16} /> Reset</button>
          <span aria-live="polite">{syncStatus === "saving" ? "Syncing…" : syncStatus === "error" ? "Saved on this device" : "Preferences sync to your account"}</span>
          <button className="button button-primary" type="button" onClick={() => { onSave(draft); onClose(); }}>Save dashboard</button>
        </footer>
      </section>
    </div>
  );
}
