import type { Course } from "@/lib/course-types";
import { MARKETING_JOB_STARTS, type MarketingJobStart } from "@/lib/product-events";

export interface MarketingJobPreset {
  value: MarketingJobStart;
  label: string;
  query: string;
}

export const MARKETING_JOB_PRESETS = [
  { value: "study_goal", label: "Coursework or exam", query: "study" },
  { value: "personal_project", label: "Personal project", query: "project" },
  { value: "career_goal", label: "Career transition or interview", query: "career" },
  { value: "work_goal", label: "Current work challenge", query: "work" },
] as const satisfies readonly MarketingJobPreset[];

export function marketingJobPreset(value: string | null | undefined) {
  if (!value || !MARKETING_JOB_STARTS.includes(value as MarketingJobStart)) return null;
  return MARKETING_JOB_PRESETS.find((preset) => preset.value === value) ?? null;
}

function courseId(course: Course) {
  return course.id ?? course.courseId;
}

function isPublicOutcomeCourse(course: Course) {
  return course.isPublic !== false
    && Boolean(courseId(course))
    && Boolean(course.outcome)
    && Boolean(course.artifact?.title || course.capstone?.deliverable || course.milestone?.deliverable);
}

function deterministicCourseOrder(left: Course, right: Course) {
  return (courseId(left) ?? "").localeCompare(courseId(right) ?? "")
    || left.topic.localeCompare(right.topic);
}

export function selectFlagshipCourse(courses: Course[], preferredCourseId?: string) {
  const eligible = courses.filter(isPublicOutcomeCourse);
  const preferred = preferredCourseId
    ? eligible.find((course) => courseId(course) === preferredCourseId)
    : undefined;
  return preferred ?? eligible.sort(deterministicCourseOrder)[0];
}

export function configuredFlagshipCourseId(courses: Course[], preferredCourseId?: string) {
  if (!preferredCourseId) return undefined;
  const preferred = courses.find((course) => (
    courseId(course) === preferredCourseId && isPublicOutcomeCourse(course)
  ));
  return preferred ? courseId(preferred) : undefined;
}
