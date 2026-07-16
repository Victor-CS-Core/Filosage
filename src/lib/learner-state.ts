"use client";

export interface LearnerState {
  courseBookmarks: string[];
  lessonBookmarks: string[];
  notes: Record<string, string>;
  weeklyLessonGoal: number;
}

const KEY = "erudoza-learner-state-v1";

export const EMPTY_LEARNER_STATE: LearnerState = {
  courseBookmarks: [],
  lessonBookmarks: [],
  notes: {},
  weeklyLessonGoal: 5,
};

export function readLearnerState(): LearnerState {
  if (typeof window === "undefined") return EMPTY_LEARNER_STATE;
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      courseBookmarks: Array.isArray(value.courseBookmarks) ? value.courseBookmarks.map(String) : [],
      lessonBookmarks: Array.isArray(value.lessonBookmarks) ? value.lessonBookmarks.map(String) : [],
      notes: value.notes && typeof value.notes === "object" ? value.notes : {},
      weeklyLessonGoal: Number.isInteger(value.weeklyLessonGoal) ? value.weeklyLessonGoal : 5,
    };
  } catch {
    return EMPTY_LEARNER_STATE;
  }
}

export function writeLearnerState(value: LearnerState) {
  localStorage.setItem(KEY, JSON.stringify(value));
}
