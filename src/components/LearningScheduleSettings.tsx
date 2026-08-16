"use client";

import { useState } from "react";
import { CalendarPlus2, Check, Clock3 } from "lucide-react";
import {
  buildLearningReminderCalendar,
  normalizeReminderPreferences,
  type ReminderCadence,
  type ReminderPreferences,
} from "@/lib/learning-reminders";
import { trackProductEvent } from "@/lib/product-analytics";

interface LearningScheduleSettingsProps {
  preferences: ReminderPreferences;
  onChange(preferences: ReminderPreferences): void;
}

const CADENCE_LABELS: Record<ReminderCadence, string> = {
  off: "Off",
  daily: "Every day",
  weekdays: "Weekdays",
  weekly: "Once a week",
};

export default function LearningScheduleSettings({
  preferences,
  onChange,
}: LearningScheduleSettingsProps) {
  const [draft, setDraft] = useState(preferences);
  const [saved, setSaved] = useState(false);

  const save = () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || draft.timezone || "UTC";
    const next = normalizeReminderPreferences({ ...draft, timezone });
    onChange(next);
    setDraft(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2_000);
    trackProductEvent("reminder_preferences_updated", { route: "/progress" });
  };

  const addToCalendar = () => {
    const calendar = buildLearningReminderCalendar({
      title: "Filosage recommended next step",
      description: "Open Filosage, complete the highest-priority review, then take one forward step.",
      preferences: draft,
    });
    if (!calendar) return;
    const blob = new Blob([calendar], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "filosage-learning-reminder.ics";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="learning-schedule-panel" aria-labelledby="learning-schedule-title">
      <div className="panel-heading">
        <div><Clock3 size={19} /><h2 id="learning-schedule-title">Learning schedule</h2></div>
        {saved && <span className="schedule-saved"><Check size={14} /> Saved</span>}
      </div>
      <p>Choose when Filosage should surface your recommended next step. Missing a session never creates a penalty or a backlog target.</p>
      <div className="learning-schedule-fields">
        <label>
          Reminder cadence
          <select
            value={draft.cadence}
            onChange={(event) => setDraft((current) => ({
              ...current,
              cadence: event.target.value as ReminderCadence,
            }))}
          >
            {(Object.keys(CADENCE_LABELS) as ReminderCadence[]).map((cadence) => (
              <option value={cadence} key={cadence}>{CADENCE_LABELS[cadence]}</option>
            ))}
          </select>
        </label>
        <label>
          Preferred time
          <input
            type="time"
            value={draft.preferredTime}
            disabled={draft.cadence === "off"}
            onChange={(event) => setDraft((current) => ({ ...current, preferredTime: event.target.value }))}
          />
        </label>
      </div>
      <label className="schedule-toggle" htmlFor="in-app-learning-reminders" aria-label="Show in-app reminders">
        <input
          id="in-app-learning-reminders"
          type="checkbox"
          checked={draft.inAppEnabled}
          onChange={(event) => setDraft((current) => ({ ...current, inAppEnabled: event.target.checked }))}
        />
        <span><strong>Show in-app reminders</strong><small>Keep the recommended next step and due-review count visible while signed in.</small></span>
      </label>
      <div className="learning-schedule-actions">
        <button className="button button-primary button-small" type="button" onClick={save}>Save schedule</button>
        <button className="button button-secondary button-small" type="button" disabled={draft.cadence === "off"} onClick={addToCalendar}>
          <CalendarPlus2 size={15} /> Add recurring calendar reminder
        </button>
      </div>
      <small className="schedule-delivery-note">Calendar reminders are generated on your device. Email delivery stays off until a transactional email provider is configured and verified.</small>
    </section>
  );
}
