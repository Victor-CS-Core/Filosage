import "server-only";

export function lessonVisualsEnabled() {
  return process.env.LESSON_VISUALS_ENABLED?.trim().toLowerCase() === "true";
}
