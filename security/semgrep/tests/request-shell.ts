import { exec as execute, execSync, execFile, spawn } from "node:child_process";
import * as childProcess from "node:child_process";

export async function unsafeAlias(request: Request) {
  const command = await request.text();
  // ruleid: filosage-request-shell-injection
  return execute(command);
}

export async function unsafeNamedImport(request: Request) {
  const command = await request.text();
  // ruleid: filosage-request-shell-injection
  return execSync(command);
}

export async function unsafeNamespace(request: Request) {
  const command = await request.text();
  // ruleid: filosage-request-shell-injection
  return childProcess.exec(command);
}

export async function unsafeShellOption(request: Request) {
  const command = await request.text();
  // ruleid: filosage-request-shell-injection
  return spawn(command, [], { shell: true });
}

export async function safeArgumentArray(request: Request) {
  const argument = await request.text();
  // ok: filosage-request-shell-injection
  return execFile("printf", ["%s", argument]);
}

export async function safeSpawn(request: Request) {
  const argument = await request.text();
  // ok: filosage-request-shell-injection
  return spawn("printf", ["%s", argument], { shell: false });
}
