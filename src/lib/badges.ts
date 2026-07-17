import type { Course } from "@/lib/course-types";
import type { CourseProgress, LessonProgress } from "@/lib/learning-types";

export type BadgeIcon =
  | "book"
  | "compass"
  | "flame"
  | "calendar"
  | "target"
  | "spark"
  | "layers"
  | "trophy"
  | "brain"
  | "repeat"
  | "clock"
  | "pencil"
  | "publish"
  | "constellation";

export type BadgeFamily = "foundation" | "momentum" | "mastery" | "creator";

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: BadgeIcon;
  family: BadgeFamily;
  target: number;
  value: (context: BadgeContext) => number;
  progressLabel: (value: number, target: number) => string;
}

export interface BadgeContext {
  progress: CourseProgress[];
  authoredCourses?: Course[];
}

export interface EvaluatedBadge extends Omit<BadgeDefinition, "value" | "progressLabel"> {
  value: number;
  earned: boolean;
  progressPercent: number;
  progressLabel: string;
}

function lessonsFor(progress: CourseProgress[]) {
  return progress.flatMap((course) => Object.values(course.lessons));
}

function questionTotals(lessons: LessonProgress[]) {
  return lessons.reduce((totals, lesson) => ({
    questions: totals.questions + lesson.totalQuestions,
    correct: totals.correct + lesson.firstAttemptCorrect,
  }), { questions: 0, correct: 0 });
}

function currentStreak(lessons: LessonProgress[]) {
  const dates = new Set(lessons.map((lesson) => lesson.lastStudiedAt.slice(0, 10)));
  const cursor = new Date();
  const key = () => cursor.toISOString().slice(0, 10);
  if (!dates.has(key())) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (dates.has(key())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const countLabel = (noun: string) => (value: number, target: number) => `${Math.min(value, target)} of ${target} ${noun}`;

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: "first-step",
    name: "First Step",
    description: "Complete your first lesson.",
    icon: "book",
    family: "foundation",
    target: 1,
    value: ({ progress }) => lessonsFor(progress).length,
    progressLabel: countLabel("lesson"),
  },
  {
    id: "curious-mind",
    name: "Curious Mind",
    description: "Begin two different courses.",
    icon: "compass",
    family: "foundation",
    target: 2,
    value: ({ progress }) => progress.length,
    progressLabel: countLabel("courses"),
  },
  {
    id: "study-hour",
    name: "Study Hour",
    description: "Complete one hour of guided lessons.",
    icon: "clock",
    family: "foundation",
    target: 60,
    value: ({ progress }) => progress.reduce((sum, course) => sum + (course.studyMinutes ?? 0), 0),
    progressLabel: (value, target) => `${Math.min(value, target)} of ${target} minutes`,
  },
  {
    id: "learning-habit",
    name: "Learning Habit",
    description: "Study on three consecutive days.",
    icon: "flame",
    family: "momentum",
    target: 3,
    value: ({ progress }) => currentStreak(lessonsFor(progress)),
    progressLabel: countLabel("days"),
  },
  {
    id: "five-study-days",
    name: "Five Study Days",
    description: "Return to learn on five different days.",
    icon: "calendar",
    family: "momentum",
    target: 5,
    value: ({ progress }) => new Set(lessonsFor(progress).map((lesson) => lesson.lastStudiedAt.slice(0, 10))).size,
    progressLabel: countLabel("days"),
  },
  {
    id: "knowledge-builder",
    name: "Knowledge Builder",
    description: "Complete ten lessons across your library.",
    icon: "layers",
    family: "momentum",
    target: 10,
    value: ({ progress }) => lessonsFor(progress).length,
    progressLabel: countLabel("lessons"),
  },
  {
    id: "clean-sweep",
    name: "Clean Sweep",
    description: "Answer every retrieval check in a lesson correctly on the first try.",
    icon: "spark",
    family: "mastery",
    target: 1,
    value: ({ progress }) => lessonsFor(progress).some((lesson) => lesson.totalQuestions > 0 && lesson.firstAttemptCorrect === lesson.totalQuestions) ? 1 : 0,
    progressLabel: (value) => value ? "Perfect lesson recorded" : "Complete a perfect lesson",
  },
  {
    id: "sharp-recall",
    name: "Sharp Recall",
    description: "Reach 80% first-try accuracy after at least ten questions.",
    icon: "target",
    family: "mastery",
    target: 80,
    value: ({ progress }) => {
      const totals = questionTotals(lessonsFor(progress));
      return totals.questions >= 10 ? Math.round((totals.correct / totals.questions) * 100) : Math.min(79, totals.questions * 8);
    },
    progressLabel: (value, target) => `${Math.min(value, target)}% of ${target}% target`,
  },
  {
    id: "knowledge-holds",
    name: "Knowledge Holds",
    description: "Master ten concepts through successful reviews.",
    icon: "brain",
    family: "mastery",
    target: 10,
    value: ({ progress }) => lessonsFor(progress).filter((lesson) => lesson.status === "mastered").length,
    progressLabel: countLabel("concepts"),
  },
  {
    id: "review-rhythm",
    name: "Review Rhythm",
    description: "Strengthen one concept through two spaced reviews.",
    icon: "repeat",
    family: "mastery",
    target: 2,
    value: ({ progress }) => Math.max(0, ...lessonsFor(progress).map((lesson) => lesson.intervalStage ?? 0)),
    progressLabel: countLabel("review stages"),
  },
  {
    id: "course-complete",
    name: "Course Complete",
    description: "Finish every lesson in one course.",
    icon: "trophy",
    family: "mastery",
    target: 1,
    value: ({ progress }) => progress.some((course) => Boolean(course.totalLessons) && course.completedLessonIds.length >= (course.totalLessons ?? 1)) ? 1 : 0,
    progressLabel: (value) => value ? "Course completed" : "Finish one course",
  },
  {
    id: "wide-perspective",
    name: "Wide Perspective",
    description: "Learn across three different courses.",
    icon: "constellation",
    family: "mastery",
    target: 3,
    value: ({ progress }) => progress.length,
    progressLabel: countLabel("courses"),
  },
  {
    id: "course-architect",
    name: "Course Architect",
    description: "Create your first focused learning path.",
    icon: "pencil",
    family: "creator",
    target: 1,
    value: ({ authoredCourses = [] }) => authoredCourses.length,
    progressLabel: countLabel("courses created"),
  },
  {
    id: "publisher",
    name: "Publisher",
    description: "Publish a course for the Erudoza library.",
    icon: "publish",
    family: "creator",
    target: 1,
    value: ({ authoredCourses = [] }) => authoredCourses.filter((course) => course.isPublic).length,
    progressLabel: countLabel("published courses"),
  },
];

export function evaluateBadges(context: BadgeContext) {
  return BADGE_DEFINITIONS.map((badge): EvaluatedBadge => {
    const value = Math.max(0, badge.value(context));
    return {
      id: badge.id,
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      family: badge.family,
      target: badge.target,
      value,
      earned: value >= badge.target,
      progressPercent: Math.min(100, Math.round((value / badge.target) * 100)),
      progressLabel: badge.progressLabel(value, badge.target),
    };
  });
}

export function featuredBadges(badges: EvaluatedBadge[], limit = 3) {
  const earned = badges.filter((badge) => badge.earned).reverse();
  const nearest = badges
    .filter((badge) => !badge.earned)
    .sort((a, b) => b.progressPercent - a.progressPercent || a.target - b.target);
  return [...earned, ...nearest].slice(0, limit);
}
