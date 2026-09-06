import { mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fingerprint, type RunCheckpoint } from "./full-course-runner.ts";

/** One writer, atomic replacement, and fsync before acknowledging spend intent. */
export async function openCheckpointDirectory(directory: string) {
  const path = resolve(directory);
  await mkdir(path, { recursive: true, mode: 0o700 });
  if (await realpath(path) !== path) throw new Error("Checkpoint directories must not traverse symlinks.");
  const lockPath = resolve(path, "run.lock");
  const lock = await open(lockPath, "wx", 0o600);
  await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
  await lock.sync();
  const statePath = resolve(path, "checkpoint.json");
  return {
    async load(): Promise<RunCheckpoint | undefined> {
      let source: string;
      try { source = await readFile(statePath, "utf8"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
      const envelope = JSON.parse(source) as { checksum: string; run: RunCheckpoint };
      if (envelope.checksum !== fingerprint(envelope.run)) throw new Error("Checkpoint checksum mismatch; preserve the file and investigate.");
      for (const item of envelope.run.cases) {
        for (const artifact of Object.values(item.artifacts)) {
          if (artifact.hash !== fingerprint(artifact.value)) throw new Error("Artifact checksum mismatch; resume is unsafe.");
        }
      }
      return envelope.run;
    },
    async save(run: RunCheckpoint) {
      const temporary = resolve(path, `checkpoint-${randomUUID()}.pending.json`);
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(`${JSON.stringify({ checksum: fingerprint(run), run }, null, 2)}\n`);
        await file.sync();
      } finally { await file.close(); }
      await rename(temporary, statePath);
      const parent = await open(path, "r");
      try { await parent.sync(); } finally { await parent.close(); }
    },
    async close() { await lock.close(); await unlink(lockPath); },
  };
}
