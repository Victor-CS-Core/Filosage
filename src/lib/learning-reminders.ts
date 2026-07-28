export const REMINDER_CADENCES = ["off", "daily", "weekdays", "weekly"] as const;
export type ReminderCadence = (typeof REMINDER_CADENCES)[number];

export interface ReminderPreferences {
  cadence: ReminderCadence;
  preferredTime: string;
  timezone: string;
  inAppEnabled: boolean;
}

export const DEFAULT_REMINDER_PREFERENCES: ReminderPreferences = {
  cadence: "off",
  preferredTime: "09:00",
  timezone: "UTC",
  inAppEnabled: true,
};

export function normalizeReminderPreferences(value: unknown): ReminderPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_REMINDER_PREFERENCES;
  }
  const input = value as Partial<ReminderPreferences>;
  const cadence = REMINDER_CADENCES.includes(input.cadence as ReminderCadence)
    ? input.cadence as ReminderCadence
    : DEFAULT_REMINDER_PREFERENCES.cadence;
  return {
    cadence,
    preferredTime: typeof input.preferredTime === "string" && /^\d{2}:\d{2}$/.test(input.preferredTime)
      ? input.preferredTime
      : DEFAULT_REMINDER_PREFERENCES.preferredTime,
    timezone: typeof input.timezone === "string" && input.timezone.trim()
      ? input.timezone.trim().slice(0, 100)
      : DEFAULT_REMINDER_PREFERENCES.timezone,
    inAppEnabled: input.inAppEnabled !== false,
  };
}

function calendarDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeCalendarText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildLearningReminderCalendar({
  title,
  description,
  preferences,
  now = new Date(),
}: {
  title: string;
  description: string;
  preferences: ReminderPreferences;
  now?: Date;
}) {
  if (preferences.cadence === "off") return null;
  const [hour, minute] = preferences.preferredTime.split(":").map(Number);
  const startsAt = new Date(now);
  startsAt.setHours(hour, minute, 0, 0);
  if (startsAt <= now) startsAt.setDate(startsAt.getDate() + 1);
  if (preferences.cadence === "weekdays") {
    while (startsAt.getDay() === 0 || startsAt.getDay() === 6) {
      startsAt.setDate(startsAt.getDate() + 1);
    }
  }
  const endsAt = new Date(startsAt.getTime() + 20 * 60_000);
  const recurrence = preferences.cadence === "daily"
    ? "FREQ=DAILY"
    : preferences.cadence === "weekdays"
      ? "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
      : "FREQ=WEEKLY";
  const uid = `learning-reminder-${startsAt.toISOString().slice(0, 10)}@erudoza.com`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Erudoza//Learning reminder//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${calendarDate(now)}`,
    `DTSTART:${calendarDate(startsAt)}`,
    `DTEND:${calendarDate(endsAt)}`,
    `RRULE:${recurrence}`,
    `SUMMARY:${escapeCalendarText(title)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    "URL:https://erudoza.com",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
