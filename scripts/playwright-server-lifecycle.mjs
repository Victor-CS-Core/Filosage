import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const lifecycleDir = process.env.ERUDOZA_PLAYWRIGHT_LIFECYCLE_DIR;

if (!lifecycleDir) {
  throw new Error("ERUDOZA_PLAYWRIGHT_LIFECYCLE_DIR is required for a Playwright-owned server.");
}

const shutdownFile = join(lifecycleDir, "shutdown");
const stoppedFile = join(lifecycleDir, "stopped");

function isStrictDescendant(parent, child) {
  const pathFromParent = relative(parent, child);
  return pathFromParent !== ""
    && pathFromParent !== ".."
    && !pathFromParent.startsWith(`..${sep}`)
    && !isAbsolute(pathFromParent);
}

export function resetPlaywrightOwnedDirectory(value, allowedRoot) {
  if (!value) throw new Error("A Playwright-owned directory was not configured.");

  const workspace = realpathSync(process.cwd());
  const allowed = resolve(workspace, allowedRoot);
  const target = resolve(workspace, value);
  if (!isStrictDescendant(workspace, allowed) || !isStrictDescendant(allowed, target)) {
    throw new Error(`Refusing to clean Playwright directory outside ${allowed}: ${target}`);
  }

  if (existsSync(allowed)) {
    const resolvedAllowed = realpathSync(allowed);
    if (resolvedAllowed !== workspace && !isStrictDescendant(workspace, resolvedAllowed)) {
      throw new Error(`Refusing to clean through an allowed-root link outside the workspace: ${allowed}`);
    }
  }

  if (!existsSync(target)) return target;
  if (!lstatSync(target).isSymbolicLink()) {
    const resolvedTarget = realpathSync(target);
    if (!isStrictDescendant(workspace, resolvedTarget)) {
      throw new Error(`Refusing to clean a resolved directory outside the workspace: ${resolvedTarget}`);
    }
  }

  rmSync(target, { recursive: true, force: true });
  return target;
}

export function installPlaywrightServerLifecycle(closeServer) {
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
