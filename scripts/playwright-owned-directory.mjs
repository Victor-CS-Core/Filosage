import { existsSync, lstatSync, realpathSync, rmSync, unlinkSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

function isStrictDescendant(parent, child) {
  const pathFromParent = relative(parent, child);
  return pathFromParent !== ""
    && pathFromParent !== ".."
    && !pathFromParent.startsWith(`..${sep}`)
    && !isAbsolute(pathFromParent);
}

function playwrightOwnedDirectoryTarget(value, allowedRoot) {
  if (!value) throw new Error("A Playwright-owned directory was not configured.");

  const workspace = realpathSync(process.cwd());
  const allowed = resolve(workspace, allowedRoot);
  const target = resolve(workspace, value);
  if (!isStrictDescendant(workspace, allowed) || !isStrictDescendant(allowed, target)) {
    throw new Error(`Refusing to use Playwright directory outside ${allowed}: ${target}`);
  }

  if (existsSync(allowed)) {
    const resolvedAllowed = realpathSync(allowed);
    if (resolvedAllowed !== workspace && !isStrictDescendant(workspace, resolvedAllowed)) {
      throw new Error(`Refusing to use an allowed-root link outside the workspace: ${allowed}`);
    }
  }

  return { target, workspace };
}

export function resolvePlaywrightOwnedDirectory(value, allowedRoot) {
  const { target, workspace } = playwrightOwnedDirectoryTarget(value, allowedRoot);
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink()) {
      throw new Error(`Refusing to use a linked Playwright directory: ${target}`);
    }
    const resolvedTarget = realpathSync(target);
    if (!isStrictDescendant(workspace, resolvedTarget)) {
      throw new Error(`Refusing to use a resolved directory outside the workspace: ${resolvedTarget}`);
    }
  }

  return target;
}

export function resetPlaywrightOwnedDirectory(value, allowedRoot) {
  const { target, workspace } = playwrightOwnedDirectoryTarget(value, allowedRoot);
  if (!existsSync(target)) return target;
  if (lstatSync(target).isSymbolicLink()) {
    unlinkSync(target);
    return target;
  }
  const resolvedTarget = realpathSync(target);
  if (!isStrictDescendant(workspace, resolvedTarget)) {
    throw new Error(`Refusing to clean a resolved directory outside the workspace: ${resolvedTarget}`);
  }
  rmSync(target, { recursive: true, force: true });
  return target;
}
