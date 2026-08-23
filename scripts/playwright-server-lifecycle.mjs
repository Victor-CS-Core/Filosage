import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export { resetPlaywrightOwnedDirectory } from "./playwright-owned-directory.mjs";

export function installPlaywrightServerLifecycle(closeServer) {
  const lifecycleDir = process.env.FILOSAGE_PLAYWRIGHT_LIFECYCLE_DIR;
  if (!lifecycleDir) {
    throw new Error("FILOSAGE_PLAYWRIGHT_LIFECYCLE_DIR is required for a Playwright-owned server.");
  }
  const shutdownFile = join(lifecycleDir, "shutdown");
  const stoppedFile = join(lifecycleDir, "stopped");
  mkdirSync(lifecycleDir, { recursive: true });
  writeFileSync(join(lifecycleDir, "pid"), String(process.pid));

  let closing = false;
  const close = async (exitCode = 0) => {
    if (closing) return;
    closing = true;
    clearInterval(shutdownPoll);

    try {
      await closeServer();
    } catch (error) {
      console.error("[playwright-server] Failed to close cleanly:", error);
      exitCode = 1;
    } finally {
      writeFileSync(stoppedFile, String(Date.now()));
      process.exit(exitCode);
    }
  };

  const shutdownPoll = setInterval(() => {
    if (existsSync(shutdownFile)) void close();
  }, 50);

  process.once("SIGINT", () => void close(130));
  process.once("SIGTERM", () => void close(143));
}
