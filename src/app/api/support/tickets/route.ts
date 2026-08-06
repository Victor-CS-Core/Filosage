import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { commandCenterEnvironmentEnabled } from "@/lib/command-center-auth";
import {
  commandCenterErrorResponse,
  createUserCommandCenterTicket,
} from "@/lib/command-center-server";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";

const supportTicketSchema = z.object({
  category: z.enum(["support", "billing", "privacy", "product_feedback", "other"]),
  subject: z.string().trim().min(5).max(160),
  message: z.string().trim().min(20).max(2_000),
}).strict();

export async function POST(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    if (!commandCenterEnvironmentEnabled()) {
      return Response.json(
        { error: "In-app support requests are temporarily unavailable. Please use the published support email." },
        { status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "60" } },
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
    const parsed = supportTicketSchema.safeParse(await readJsonBody(request, 4_096));
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Check the request and try again." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const ticket = await createUserCommandCenterTicket({ actorUid: account.uid, ...parsed.data });
    return Response.json(
      { submitted: true, ticketNumber: ticket.ticketNumber },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? commandCenterErrorResponse(error)
      ?? Response.json({ error: "Your support request could not be submitted." }, { status: 500 });
  }
}
