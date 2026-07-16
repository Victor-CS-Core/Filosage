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
}

export interface CourseProgress {
  id?: string;
  courseId: string;
  topic: string;
  lastLessonId: string;
  lastLessonTitle: string;
  completedLessonIds: string[];
  lessons: Record<string, LessonProgress>;
  totalLessons?: number;
  lastActivityAt: string;
  startedAt: string;
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
}
