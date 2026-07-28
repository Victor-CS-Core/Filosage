export type Confidence = "low" | "medium" | "high";

export interface LessonProgress {
  lessonId: string;
  lessonTitle: string;
  status: "started" | "learned" | "mastered";
  attempts: number;
  totalQuestions: number;
  firstAttemptCorrect: number;
  confidence: Confidence;
  intervalStage: number;
  nextReviewAt: string;
  lastStudiedAt: string;
  completedAt?: string;
  estimatedMinutes?: number;
  /** The misconception this lesson corrects, recorded at completion. */
  misconception?: string;
}

export interface CapstoneAssessment {
  status: "passed" | "needs_revision";
  summary: string;
  criteria: Array<{ criterion: string; met: boolean; feedback: string }>;
  assessedAt: string;
  attempts: number;
}

export interface BaselineAssessment {
  summary: string;
  criteria: Array<{ criterion: string; met: boolean; feedback: string }>;
  assessedAt: string;
  score: number;
}

export interface CourseProgress {
  id?: string;
  courseId: string;
  topic: string;
  lastLessonId: string;
  lastLessonTitle: string;
  nextLessonId?: string | null;
  nextLessonTitle?: string | null;
  completedLessonIds: string[];
  lessons: Record<string, LessonProgress>;
  totalLessons?: number;
  lastActivityAt: string;
  startedAt: string;
  studyMinutes?: number;
  capstone?: CapstoneAssessment;
}

export interface ProgressUpdate {
  courseId: string;
  topic: string;
  lessonId: string;
  lessonTitle: string;
  totalQuestions: number;
  firstAttemptCorrect: number;
  attempts: number;
  confidence: Confidence;
  review?: boolean;
  totalLessons?: number;
  estimatedMinutes?: number;
  nextLessonId?: string | null;
  nextLessonTitle?: string | null;
  misconception?: string;
}
