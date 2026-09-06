"use client";

import type { CourseProgress } from "@/lib/learning-types";
import { removeCourseFromLearnerState } from "@/lib/learner-state";
import { removeLocalProgress } from "@/lib/learning-progress";
import { removeLocalMasteryJourney } from "@/lib/mastery";

import { activeLearnerUid, isCurrentLearnerSession, learnerSessionSnapshot, learnerStorageKey, removeLearnerStorage } from "@/lib/learner-storage";

export function outcomeFeedbackStorageKey(courseId: string, uid = activeLearnerUid()) {
  return uid ? learnerStorageKey(uid, "outcome-feedback", courseId) : null;
}

export function clearLocalCourseData(courseId: string, uid: string | null) {
  if (typeof window === "undefined" || !courseId || !uid || uid !== activeLearnerUid()) return;
  removeLocalProgress(courseId, uid);
  removeCourseFromLearnerState(courseId, uid);
  removeLocalMasteryJourney(courseId, uid);
  try {
    removeLearnerStorage(uid, "outcome-feedback", courseId);
  } catch {
    // The rest of the cleanup is still useful when one storage write fails.
  }
  window.dispatchEvent(new Event("filosage:courses-changed"));
  window.dispatchEvent(new CustomEvent("filosage:course-deleted", { detail: { courseId } }));
}

export async function removeDeletedLocalCourses(progress: CourseProgress[]) {
  const session = learnerSessionSnapshot();
  const resolutions = await Promise.all(progress.map(async (courseProgress) => {
    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(courseProgress.courseId)}`, {
        cache: "no-store",
      });
      if (!isCurrentLearnerSession(session)) return null;
      if (response.status === 404) {
        clearLocalCourseData(courseProgress.courseId, session.uid);
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
