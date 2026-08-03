import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FullConfig } from "@playwright/test";

function processIsRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function stopOwnedServer(lifecycleDir: string) {
  const pidFile = join(lifecycleDir, "pid");
  if (!existsSync(pidFile)) return;

  const pid = Number(readFileSync(pidFile, "utf8"));
  if (!Number.isInteger(pid) || pid < 1) {
    throw new Error(`Invalid Playwright server pid in ${pidFile}.`);
  }

  writeFileSync(join(lifecycleDir, "shutdown"), String(Date.now()));
  const gracefulDeadline = Date.now() + 5_000;
  while (Date.now() < gracefulDeadline) {
    if (existsSync(join(lifecycleDir, "stopped")) || !processIsRunning(pid)) return;
    await delay(50);
  }

  // This is the exact PID written by the test-owned wrapper, never a discovered
  // or system-wide process. The fallback prevents a failed close from hanging CI.
  process.kill(pid, "SIGKILL");
  const forcedDeadline = Date.now() + 2_000;
  while (Date.now() < forcedDeadline) {
    if (!processIsRunning(pid)) return;
    await delay(50);
  }

  throw new Error(`Playwright-owned server process ${pid} did not stop.`);
}

export default async function stopOwnedServers(config: FullConfig) {
  const configured = config.metadata.erudozaPlaywrightLifecycleDirs
    ?? config.metadata.erudozaPlaywrightLifecycleDir;
  const lifecycleDirs = Array.isArray(configured) ? configured : [configured];
  await Promise.all(lifecycleDirs
    .filter((value): value is string => typeof value === "string")
    .map(stopOwnedServer));
}
