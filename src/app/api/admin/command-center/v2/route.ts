import { withAccountRequest } from "@/lib/auth-server";
import { authorizationResponse } from "@/lib/auth-server";
import {
  commandCenterAuthorizationResponse,
  requireCommandCenterPermission,
} from "@/lib/command-center-auth";
import { CommandCenterSnapshotCursorError } from "@/lib/command-center-schemas";
import { getCommandCenterSnapshotV2 } from "@/lib/command-center-server";
import type { CommandCenterSnapshotCollection } from "@/lib/command-center-types";

const cursorParameters: Record<CommandCenterSnapshotCollection, string> = {
  tickets: "ticketsCursor",
  approvals: "approvalsCursor",
  drafts: "draftsCursor",
  auditEvents: "auditEventsCursor",
};

async function handleGET(request: Request) {
  try {
    await requireCommandCenterPermission(request, "view");
    const search = new URL(request.url).searchParams;
    const rawLimit = search.get("limit");
    const limit = rawLimit === null ? 500 : Number(rawLimit);
    const cursors = Object.fromEntries(
      Object.entries(cursorParameters)
        .map(([section, parameter]) => [section, search.get(parameter) ?? undefined])
        .filter((entry) => entry[1] !== undefined),
    );
    return Response.json(
      await getCommandCenterSnapshotV2({
        limit,
        cursors: cursors as Partial<Record<CommandCenterSnapshotCollection, string>>,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return commandCenterAuthorizationResponse(error)
      ?? authorizationResponse(error)
      ?? (error instanceof CommandCenterSnapshotCursorError
        ? Response.json(
            { error: error.message },
            { status: 400, headers: { "Cache-Control": "private, no-store" } },
          )
        : null)
      ?? Response.json(
        { error: "The command center could not be loaded." },
        { status: 500, headers: { "Cache-Control": "private, no-store" } },
      );
  }
}

export const GET = withAccountRequest(handleGET);
