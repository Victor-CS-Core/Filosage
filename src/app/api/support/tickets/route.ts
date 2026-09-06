import { withAccountRequest } from "@/lib/auth-server";
import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { supportSubmissionEnabled } from "@/lib/support-availability";
import {
  commandCenterErrorResponse,
  createUserCommandCenterTicket,
  findUserCommandCenterTicketByRequest,
  listUserCommandCenterTickets,
} from "@/lib/command-center-server";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { learnerSupportCategories } from "@/lib/support-center-types";

const requestContextSchema = z.object({
  pathname: z.string().trim().regex(/^\/(?!\/)[^?#\s]{0,239}$/),
  pageTitle: z.string().trim().min(1).max(120).optional(),
  feature: z.string().trim().regex(/^[a-z0-9-]{1,80}$/).optional(),
}).strict();

const supportTicketSchema = z.object({
  category: z.enum(learnerSupportCategories),
  subject: z.string().trim().min(5).max(160),
  message: z.string().trim().min(20).max(2_000),
  requestContext: requestContextSchema.optional(),
}).strict();

function idempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value) return null;
  return /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value : undefined;
}

async function handleGET(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    const tickets = await listUserCommandCenterTickets(account.uid);
    return Response.json({ tickets }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? commandCenterErrorResponse(error)
      ?? Response.json({ error: "Your support requests could not be loaded." }, { status: 500 });
  }
}

async function handlePOST(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    if (!await supportSubmissionEnabled()) {
      return Response.json(
        { error: "In-app support requests are temporarily unavailable. Please use the published support email.", code: "SUPPORT_SUBMISSION_UNAVAILABLE", submissionEnabled: false },
        { status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "60" } },
      );
    }
    const parsed = supportTicketSchema.safeParse(await readJsonBody(request, 4_096));
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      return Response.json(
        { error: "Check the highlighted fields and try again.", fieldErrors },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const requestKey = idempotencyKey(request);
    if (requestKey === undefined) {
      return Response.json(
        { error: "The request identifier is invalid. Refresh the page and try again." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const ticketInput = { actorUid: account.uid, idempotencyKey: requestKey, ...parsed.data };
    const existing = await findUserCommandCenterTicketByRequest(ticketInput);
    if (existing) {
      return Response.json(
        { submitted: true, ticketNumber: existing.ticketNumber, ticketId: existing.id },
        { status: 201, headers: { "Cache-Control": "private, no-store", "X-Idempotent-Replay": "true" } },
      );
    }
    const limited = await enforceDurableRateLimit(
      request,
      "support-ticket",
      5,
      24 * 60 * 60_000,
      account.uid,
    );
    if (limited) return limited;
    const ticket = await createUserCommandCenterTicket(ticketInput);
    return Response.json(
      { submitted: true, ticketNumber: ticket.ticketNumber, ticketId: ticket.id },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? commandCenterErrorResponse(error)
      ?? Response.json({ error: "Your support request could not be submitted." }, { status: 500 });
  }
}

export const GET = withAccountRequest(handleGET);
export const POST = withAccountRequest(handlePOST);
