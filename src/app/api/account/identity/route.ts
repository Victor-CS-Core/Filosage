import { NextResponse } from "next/server";
import { authorizationResponse, requireRecentlyAuthenticatedUser } from "@/lib/auth-server";
import { serverEnvironment } from "@/lib/runtime-environment";

interface GraphTokenResponse {
  access_token?: string;
}

async function graphAccessToken() {
  const tenantId = serverEnvironment.ENTRA_DIRECTORY_TENANT_ID?.trim();
  const clientId = serverEnvironment.ENTRA_DIRECTORY_CLIENT_ID?.trim();
  const clientSecret = serverEnvironment.ENTRA_DIRECTORY_CLIENT_SECRET?.trim();
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Entra identity deletion is not configured.");
  }
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }),
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(`Microsoft Graph authentication failed (${response.status}).`);
  const token = await response.json() as GraphTokenResponse;
  if (!token.access_token) throw new Error("Microsoft Graph did not return an access token.");
  return token.access_token;
}

export async function DELETE(request: Request) {
  try {
    const user = await requireRecentlyAuthenticatedUser(
      request,
      "Sign in again before permanently deleting your identity.",
    );
    const accessToken = await graphAccessToken();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user.uid)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Microsoft Entra identity deletion failed (${response.status}).`);
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const authorization = authorizationResponse(error);
    if (authorization) return authorization;
    console.error("Identity deletion failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json(
      { error: "Your sign-in identity could not be deleted automatically. Contact privacy support." },
      { status: 503 },
    );
  }
}
