type OutlineLike = {
  outcome: string;
  modules: Array<{
    objective: string;
    challenge: Record<string, unknown>;
    lessons: Array<{ objective: string } & Record<string, unknown>>;
  } & Record<string, unknown>>;
  capstone: Record<string, unknown>;
} & Record<string, unknown>;

function inferredLessonKind(
  lesson: Record<string, unknown>,
  moduleIndex: number,
  lessonIndex: number,
  lastModuleIndex: number,
  lastLessonIndex: number,
) {
  const title = String(lesson.title ?? "").trim().toLowerCase();
  if (/^(?:introduction|orientation|getting started)\b/.test(title)) return "introduction" as const;
  if (/^(?:glossary|terms and definitions)\b/.test(title)) return "glossary" as const;
  if (/^(?:reference|reference guide|cheat sheet)\b/.test(title)) return "reference" as const;
  if (/^(?:review|recap)\b/.test(title)) return "review" as const;
  if (lesson.lessonMode === "synthesis" && moduleIndex === lastModuleIndex && lessonIndex === lastLessonIndex) {
    return "capstone" as const;
  }
  return "substantive" as const;
}

export function withCourseObjectiveRelationships<T extends OutlineLike>(outline: T) {
  const lessonObjectiveIds: string[] = [];
  const objectives: Array<{
    id: string;
    description: string;
    level: "course" | "module" | "lesson";
    required: boolean;
  }> = [{
    id: "objective-course",
    description: outline.outcome,
    level: "course",
    required: true,
  }];
  const lastModuleIndex = outline.modules.length - 1;
  const modules = outline.modules.map((courseModule, moduleIndex) => {
    const moduleObjectiveId = `objective-m${moduleIndex}`;
    objectives.push({
      id: moduleObjectiveId,
      description: courseModule.objective,
      level: "module",
      required: true,
    });
    const lastLessonIndex = courseModule.lessons.length - 1;
    const lessons = courseModule.lessons.map((lesson, lessonIndex) => {
      const objectiveId = `objective-m${moduleIndex}-l${lessonIndex}`;
      lessonObjectiveIds.push(objectiveId);
      objectives.push({
        id: objectiveId,
        description: lesson.objective,
        level: "lesson",
        required: true,
      });
      return {
        ...lesson,
        objectiveId,
        lessonKind: inferredLessonKind(lesson, moduleIndex, lessonIndex, lastModuleIndex, lastLessonIndex),
      };
    });
    return {
      ...courseModule,
      objectiveId: moduleObjectiveId,
      challenge: {
        ...courseModule.challenge,
        objectiveIds: [moduleObjectiveId, ...lessons.map((lesson) => lesson.objectiveId)],
      },
      lessons,
    };
  });
  return {
    ...outline,
    objectives,
    modules,
    capstone: {
      ...outline.capstone,
      objectiveIds: ["objective-course", ...lessonObjectiveIds],
    },
  };
}

export function canonicalLessonObjectiveId(moduleIndex: number, lessonIndex: number) {
  return `objective-m${moduleIndex}-l${lessonIndex}`;
}
