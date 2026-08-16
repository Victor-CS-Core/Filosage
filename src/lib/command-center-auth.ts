import "server-only";

import { requireOwner } from "@/lib/auth-server";
import { serverEnvironment } from "@/lib/runtime-environment";

export type CommandCenterPermission = "view" | "triage" | "publish_reply" | "generate_draft" | "review_draft" | "request_approval" | "review_approval" | "manage_controls";

const ownerPermissions: ReadonlySet<CommandCenterPermission> = new Set([
  "view",
  "triage",
  "publish_reply",
  "generate_draft",
  "review_draft",
  "request_approval",
  "review_approval",
  "manage_controls",
]);

export function commandCenterEnvironmentEnabled() {
  const configured = serverEnvironment.COMMAND_CENTER_ENABLED?.trim().toLowerCase();
  if (!configured && serverEnvironment.NODE_ENV !== "production") return true;
  return configured === "true";
}

export function commandCenterDraftsEnvironmentEnabled() {
  const configured = serverEnvironment.COMMAND_CENTER_DRAFTS_ENABLED?.trim().toLowerCase();
  if (!configured && serverEnvironment.NODE_ENV !== "production") return true;
  return configured === "true";
}

export class CommandCenterUnavailableError extends Error {
  readonly status = 404;
}

export async function requireCommandCenterPermission(
  request: Request,
  permission: CommandCenterPermission,
) {
  if (!commandCenterEnvironmentEnabled()) {
    throw new CommandCenterUnavailableError("The command center is not enabled.");
  }
  // The boundary is intentionally permission-shaped even though Phase 1 grants
  // every permission only to the verified owner. Future reviewer roles must be
  // added here, never inferred from client state or a route-local check.
  const owner = await requireOwner(request);
  if (!ownerPermissions.has(permission)) throw new CommandCenterUnavailableError("The requested command-center permission is unavailable.");
  return owner;
}

export function commandCenterAuthorizationResponse(error: unknown) {
  if (!(error instanceof CommandCenterUnavailableError)) return null;
  return Response.json(
    { error: error.message },
    { status: error.status, headers: { "Cache-Control": "private, no-store" } },
  );
}
