"use client";

import type { CourseProgress } from "@/lib/learning-types";
import { removeCourseFromLearnerState } from "@/lib/learner-state";
import { removeLocalProgress } from "@/lib/learning-progress";
import { removeLocalMasteryJourney } from "@/lib/mastery";

const OUTCOME_FEEDBACK_PREFIX = "filosage:outcome-feedback:";

export function outcomeFeedbackStorageKey(courseId: string) {
  return `${OUTCOME_FEEDBACK_PREFIX}${courseId}`;
}

export function clearLocalCourseData(courseId: string) {
  if (typeof window === "undefined" || !courseId) return;
  removeLocalProgress(courseId);
  removeCourseFromLearnerState(courseId);
  removeLocalMasteryJourney(courseId);
  try {
    localStorage.removeItem(outcomeFeedbackStorageKey(courseId));
  } catch {
    // The rest of the cleanup is still useful when one storage write fails.
  }
  window.dispatchEvent(new Event("filosage:courses-changed"));
  window.dispatchEvent(new CustomEvent("filosage:course-deleted", { detail: { courseId } }));
}

export async function removeDeletedLocalCourses(progress: CourseProgress[]) {
  const resolutions = await Promise.all(progress.map(async (courseProgress) => {
    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(courseProgress.courseId)}`, {
        cache: "no-store",
      });
      if (response.status === 404) {
        clearLocalCourseData(courseProgress.courseId);
        return null;
      }
      if (response.status === 401 || response.status === 403) {
        return null;
      }
      return courseProgress;
    } catch {
      // Preserve offline review schedules when course existence cannot be checked.
      return courseProgress;
    }
  }));
  return resolutions.filter((item): item is CourseProgress => item !== null);
}
