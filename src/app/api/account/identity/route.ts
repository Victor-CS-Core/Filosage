import { NextResponse } from "next/server";
import { authorizationResponse, requireRecentlyAuthenticatedUser } from "@/lib/auth-server";

export async function DELETE(request: Request) {
  try {
    await requireRecentlyAuthenticatedUser(
      request,
      "Sign in again before permanently deleting your Filosage account.",
    );
    // Filosage stores no password or hosted identity record. The preceding
    // account-data request deletes the application data; the Google account
    // remains under the user's control and must never be deleted by Filosage.
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return authorizationResponse(error)
      ?? NextResponse.json({ error: "Your sign-in confirmation could not be verified." }, { status: 503 });
  }
}
