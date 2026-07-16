export interface LessonSummary {
  title: string;
  concept: string;
}

export interface CourseModule {
  title: string;
  description?: string;
  lessons: LessonSummary[];
}

export interface Course {
  id?: string;
  courseId?: string;
  topic: string;
  mission?: string;
  modules: CourseModule[];
  authorId?: string;
  authorName?: string;
  authorPhoto?: string;
  isPublic?: boolean;
}

export interface Quiz {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface LessonData {
  content: string;
  diagram: string;
  quizzes: Quiz[];
}
