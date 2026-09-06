import { withAccountRequest } from "@/lib/auth-server";
import { findAccountDeletionJob } from "@/lib/account-deletion";
import { NextResponse } from "next/server";
import { authorizationResponse, requireRecentlyAuthenticatedUser } from "@/lib/auth-server";

async function handleDELETE(request: Request) {
  try {
    const user = await requireRecentlyAuthenticatedUser(
      request,
      "Sign in again before permanently deleting your Filosage account.",
    );
    const job = await findAccountDeletionJob(user.uid);
    return NextResponse.json({
      identityDeleted: false, status: "manual_review", jobId: job?.jobId,
      message: "Identity mappings remain for verified account and privacy recovery. Contact legal@filosage.com to review their removal. External provider accounts remain under your control.",
    }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return authorizationResponse(error)
      ?? NextResponse.json({ error: "Your sign-in confirmation could not be verified." }, { status: 503 });
  }
}

export const DELETE = withAccountRequest(handleDELETE);
