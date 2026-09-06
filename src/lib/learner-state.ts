"use client";

import {
  DEFAULT_DASHBOARD_PREFERENCES,
  normalizeDashboardPreferences,
  type DashboardPreferences,
} from "@/lib/dashboard-preferences";
import { removeCourseReferences } from "@/lib/course-deletion";
import {
  DEFAULT_REMINDER_PREFERENCES,
  normalizeReminderPreferences,
  type ReminderPreferences,
} from "@/lib/learning-reminders";

export interface LearnerState {
  courseBookmarks: string[];
  lessonBookmarks: string[];
  notes: Record<string, string>;
  noteUpdatedAt: Record<string, string>;
  weeklyLessonGoal: number;
  dashboardPreferences: DashboardPreferences;
  reminderPreferences: ReminderPreferences;
  updatedAt?: string;
}

import { activeLearnerUid, readLearnerStorage, writeLearnerStorage } from "@/lib/learner-storage";

export const EMPTY_LEARNER_STATE: LearnerState = {
  courseBookmarks: [],
  lessonBookmarks: [],
  notes: {},
  noteUpdatedAt: {},
  weeklyLessonGoal: 5,
  dashboardPreferences: DEFAULT_DASHBOARD_PREFERENCES,
  reminderPreferences: DEFAULT_REMINDER_PREFERENCES,
};

export function readLearnerState(uid = activeLearnerUid()): LearnerState {
  if (typeof window === "undefined") return EMPTY_LEARNER_STATE;
  try {
    const value = readLearnerStorage<Partial<LearnerState>>(uid, "learner-state") ?? {};
    return {
      courseBookmarks: Array.isArray(value.courseBookmarks) ? value.courseBookmarks.map(String) : [],
      lessonBookmarks: Array.isArray(value.lessonBookmarks) ? value.lessonBookmarks.map(String) : [],
      notes: value.notes && typeof value.notes === "object" ? value.notes : {},
      noteUpdatedAt: value.noteUpdatedAt && typeof value.noteUpdatedAt === "object" ? value.noteUpdatedAt : {},
      weeklyLessonGoal: typeof value.weeklyLessonGoal === "number" && Number.isInteger(value.weeklyLessonGoal) ? value.weeklyLessonGoal : 5,
      dashboardPreferences: normalizeDashboardPreferences(value.dashboardPreferences),
      reminderPreferences: normalizeReminderPreferences(value.reminderPreferences),
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
    };
  } catch {
    return EMPTY_LEARNER_STATE;
  }
}

export function writeLearnerState(value: LearnerState, uid = activeLearnerUid()) {
  return writeLearnerStorage(uid, "learner-state", "all", value);
}

export function removeCourseFromLearnerState(courseId: string, uid = activeLearnerUid()) {
  if (typeof window === "undefined") return EMPTY_LEARNER_STATE;
  const current = readLearnerState(uid);
  const cleaned = removeCourseReferences(
    current as unknown as Record<string, unknown>,
    courseId,
  );
  const next = {
    ...(cleaned.value as unknown as LearnerState),
    updatedAt: new Date().toISOString(),
  };
  writeLearnerState(next, uid);
  return next;
}
