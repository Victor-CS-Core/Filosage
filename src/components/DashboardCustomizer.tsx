"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, GripVertical, LockKeyhole, RotateCcw, X } from "lucide-react";
import AppDrawer from "@/components/AppDrawer";
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
  { id: "progress", label: "Progress", description: "Concept strength and activity first." },
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
  mastered: "Secure concepts",
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

function moveItemTo<T>(items: T[], item: T, target: T) {
  const from = items.indexOf(item);
  const to = items.indexOf(target);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items];
  next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function DashboardCustomizer({ open, preferences, syncStatus, onClose, onSave }: DashboardCustomizerProps) {
  const [draft, setDraft] = useState(() => cloneDashboardPreferences(preferences));
  const [dragging, setDragging] = useState<{ key: DashboardMainSection | DashboardSideSection; group: "main" | "side" } | null>(null);
  const [reorderStatus, setReorderStatus] = useState("");

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

  const reorderTo = (
    key: DashboardMainSection | DashboardSideSection,
    target: DashboardMainSection | DashboardSideSection,
    group: "main" | "side",
  ) => {
    setDraft((current) => ({
      ...current,
      preset: "custom",
      [group === "main" ? "mainOrder" : "sideOrder"]: moveItemTo(
        group === "main" ? current.mainOrder : current.sideOrder,
        key as never,
        target as never,
      ),
    }));
  };

  const finishReorder = (key: DashboardMainSection | DashboardSideSection) => {
    setDragging(null);
    setReorderStatus(`${sectionLabels[key]} moved. Save the dashboard to keep this order.`);
  };

  const sectionRow = (key: DashboardMainSection | DashboardSideSection, index: number, order: Array<DashboardMainSection | DashboardSideSection>, group: "main" | "side") => (
    <li
      key={key}
      data-dashboard-key={key}
      data-dashboard-group={group}
      className={dragging?.key === key && dragging.group === group ? "is-dragging" : ""}
    >
      <span
        className="drag-handle"
        role="button"
        tabIndex={0}
        draggable
        aria-label={`Drag ${sectionLabels[key]} to reorder`}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", key);
          setDragging({ key, group });
        }}
        onDragOver={(event) => {
          if (!dragging || dragging.group !== group || dragging.key === key) return;
          event.preventDefault();
          reorderTo(dragging.key, key, group);
        }}
        onDragEnd={() => finishReorder(key)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          const direction = event.key === "ArrowUp" ? -1 : 1;
          setDraft((current) => ({
            ...current,
            preset: "custom",
            [group === "main" ? "mainOrder" : "sideOrder"]: moveItem(
              group === "main" ? current.mainOrder : current.sideOrder,
              index,
              direction,
            ),
          }));
          setReorderStatus(`${sectionLabels[key]} moved ${direction === -1 ? "up" : "down"}.`);
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging({ key, group });
        }}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse" || !dragging || dragging.group !== group || dragging.key !== key) return;
          const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-dashboard-key]");
          if (!target || target.dataset.dashboardGroup !== group || !target.dataset.dashboardKey) return;
          reorderTo(key, target.dataset.dashboardKey as DashboardMainSection | DashboardSideSection, group);
        }}
        onPointerUp={(event) => {
          if (event.pointerType === "mouse") return;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          finishReorder(key);
        }}
      >
        <GripVertical size={17} aria-hidden="true" />
      </span>
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
    <AppDrawer open={open} onClose={onClose} labelledBy="customizer-title" className="dashboard-customizer-drawer" mobilePlacement="bottom" size="wide">
      <section className="dashboard-customizer">
        <header>
          <div><p className="overline">Your dashboard</p><h2 id="customizer-title">Choose what helps you focus.</h2><p>Hide distractions, surface useful progress, and change the order of supporting sections.</p></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dashboard settings"><X size={19} /></button>
        </header>

        <div className="customizer-scroll">
          <p className="sr-only" aria-live="polite">{reorderStatus}</p>
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
    </AppDrawer>
  );
}
