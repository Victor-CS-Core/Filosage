import "server-only";

import { serverEnvironment } from "@/lib/runtime-environment";

export function lessonVisualsEnabled() {
  return serverEnvironment.LESSON_VISUALS_ENABLED?.trim().toLowerCase() === "true";
}
