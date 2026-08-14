import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { localCourseOutlineFixture } from "../src/lib/local-course-fixture.ts";

type LocalStore = Record<string, Record<string, unknown>>;

const workspaceRoot = process.cwd();
const localStoreDirectory = resolve(workspaceRoot, ".filosage-local");
const localStorePath = resolve(localStoreDirectory, "store.json");
const localStoreRelativePath = relative(workspaceRoot, localStorePath);

if (isAbsolute(localStoreRelativePath) || localStoreRelativePath.startsWith("..")) {
  throw new Error("The local carousel seed must remain inside this Filosage workspace.");
}

const store = existsSync(localStorePath)
  ? JSON.parse(readFileSync(localStorePath, "utf8")) as LocalStore
  : {};

const topics = [
  { topic: "Decision Architecture", category: "Strategy" },
  { topic: "Research Synthesis", category: "Research" },
  { topic: "Product Strategy", category: "Product" },
  { topic: "Data Storytelling", category: "Analytics" },
] as const;

const now = Date.now();
const createdIds: string[] = [];

for (const [index, seed] of topics.entries()) {
  const id = `carousel-${seed.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
  const outline = localCourseOutlineFixture(seed.topic);
  const firstLesson = outline.modules[0].lessons[0];
  const activityAt = new Date(now - index * 18 * 60_000).toISOString();
  const createdAt = new Date(now - (index + 1) * 86_400_000).toISOString();

  store[`courses/${id}`] = {
    topic: seed.topic,
    ...outline,
    category: seed.category,
    topicKey: seed.topic.toLowerCase(),
    schemaVersion: 2,
    authorId: "local-owner",
    authorName: "Local Owner",
    authorPhoto: null,
    isPublic: false,
    aiAssisted: false,
    createdAt,
    updatedAt: activityAt,
  };

  store[`courses/${id}/lessons/0-0`] = {
    learningObjective: firstLesson.objective,
    connection: `This opening lesson establishes the working model for ${seed.topic}.`,
    keyTakeaways: [
      `${seed.topic} is useful when it changes a concrete decision.`,
      "A visible reasoning trail makes the result easier to inspect and improve.",
      "Transfer to a new situation is stronger evidence than repeating a definition.",
    ],
    content: `## Start with the decision\n\nUse ${seed.topic} to name the decision, the evidence that matters, and the limitation that keeps the conclusion honest. This local lesson is intentionally concise so the carousel can be tested without making an external AI request.\n\n## Apply the model\n\nChoose a familiar work situation. State the outcome first, identify one relevant constraint, and explain how the course model changes the next action.\n\n## Check the boundary\n\nName one situation where the model would be less useful. A clear boundary is part of a professional recommendation, not a weakness.`,
    guidedPractice: {
      prompt: `Apply ${seed.topic} to a small decision from your current work.`,
      steps: ["State the decision in one sentence.", "Name the evidence and one limitation."],
      modelAnswer: "A strong response connects the recommendation to named evidence and keeps one boundary visible.",
    },
    transferTask: {
      prompt: `Use ${seed.topic} in a situation different from your first example.`,
      successCriteria: ["The new situation is meaningfully different", "The reasoning names evidence and a limitation"],
      modelResponse: "A strong transfer response adapts the model instead of copying the first example.",
    },
    visuals: [],
    quizzes: [],
    authorId: "local-owner",
    aiAssisted: false,
    isPublic: false,
    schemaVersion: 3,
    sourceReferences: [],
    createdAt,
    updatedAt: activityAt,
  };

  store[`users/local-owner/courseProgress/${id}`] = {
    courseId: id,
    topic: seed.topic,
    lastLessonId: "",
    lastLessonTitle: "Start the course",
    nextLessonId: "0-0",
    nextLessonTitle: firstLesson.title,
    completedLessonIds: [],
    lessons: {},
    totalLessons: outline.modules.reduce((sum, module) => sum + module.lessons.length, 0),
    lastActivityAt: activityAt,
    startedAt: createdAt,
    studyMinutes: 0,
  };

  createdIds.push(id);
}

mkdirSync(localStoreDirectory, { recursive: true });
writeFileSync(localStorePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
console.log(`Seeded ${createdIds.length} local carousel courses: ${createdIds.join(", ")}`);
