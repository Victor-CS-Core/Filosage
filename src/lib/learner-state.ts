"use client";

import {
  DEFAULT_DASHBOARD_PREFERENCES,
  normalizeDashboardPreferences,
  type DashboardPreferences,
} from "@/lib/dashboard-preferences";
import { removeCourseReferences } from "@/lib/course-deletion";

export interface LearnerState {
  courseBookmarks: string[];
  lessonBookmarks: string[];
  notes: Record<string, string>;
  noteUpdatedAt: Record<string, string>;
  weeklyLessonGoal: number;
  dashboardPreferences: DashboardPreferences;
  updatedAt?: string;
}

const KEY = "erudoza-learner-state-v1";

export const EMPTY_LEARNER_STATE: LearnerState = {
  courseBookmarks: [],
  lessonBookmarks: [],
  notes: {},
  noteUpdatedAt: {},
  weeklyLessonGoal: 5,
  dashboardPreferences: DEFAULT_DASHBOARD_PREFERENCES,
};

export function readLearnerState(): LearnerState {
  if (typeof window === "undefined") return EMPTY_LEARNER_STATE;
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      courseBookmarks: Array.isArray(value.courseBookmarks) ? value.courseBookmarks.map(String) : [],
      lessonBookmarks: Array.isArray(value.lessonBookmarks) ? value.lessonBookmarks.map(String) : [],
      notes: value.notes && typeof value.notes === "object" ? value.notes : {},
      noteUpdatedAt: value.noteUpdatedAt && typeof value.noteUpdatedAt === "object" ? value.noteUpdatedAt : {},
      weeklyLessonGoal: Number.isInteger(value.weeklyLessonGoal) ? value.weeklyLessonGoal : 5,
      dashboardPreferences: normalizeDashboardPreferences(value.dashboardPreferences),
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
    };
  } catch {
    return EMPTY_LEARNER_STATE;
  }
}

export function writeLearnerState(value: LearnerState) {
  localStorage.setItem(KEY, JSON.stringify(value));
}

export function removeCourseFromLearnerState(courseId: string) {
  if (typeof window === "undefined") return EMPTY_LEARNER_STATE;
  const current = readLearnerState();
  const cleaned = removeCourseReferences(
    current as unknown as Record<string, unknown>,
    courseId,
  );
  const next = {
    ...(cleaned.value as unknown as LearnerState),
    updatedAt: new Date().toISOString(),
  };
  writeLearnerState(next);
  return next;
}
