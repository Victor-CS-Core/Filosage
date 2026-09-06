import { withAccountRequest } from "@/lib/auth-server";
import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse } from "@/lib/auth-server";
import {
  commandCenterAuthorizationResponse,
  requireCommandCenterPermission,
} from "@/lib/command-center-auth";
import {
  commandCenterErrorResponse,
  updateCommandCenterControls,
} from "@/lib/command-center-server";

const controlsSchema = z.object({
  expectedVersion: z.number().int().positive(),
  systemEnabled: z.boolean(),
  killSwitchActive: z.boolean(),
  agentFlags: z.object({
    support: z.boolean(),
    legal: z.boolean(),
    billing: z.boolean(),
    privacy: z.literal(false),
    content: z.literal(false),
    productOperations: z.boolean(),
    knowledge: z.literal(false),
    founderBrief: z.boolean(),
  }).strict(),
}).strict();

async function handlePATCH(request: Request) {
  try {
    const owner = await requireCommandCenterPermission(request, "manage_controls");
    const parsed = controlsSchema.safeParse(await readJsonBody(request, 1_024));
    if (!parsed.success) {
      return Response.json({ error: "Check the control settings." }, { status: 400 });
    }
    const controls = await updateCommandCenterControls({ actorUid: owner.uid, ...parsed.data });
    return Response.json({ controls }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? commandCenterAuthorizationResponse(error)
      ?? authorizationResponse(error)
      ?? commandCenterErrorResponse(error)
      ?? Response.json({ error: "The controls could not be updated." }, { status: 500 });
  }
}

export const PATCH = withAccountRequest(handlePATCH);
