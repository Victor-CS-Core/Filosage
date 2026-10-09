import {
  clearStateCookie,
  createSessionCookie,
  exchangeCodeForTokens,
  getRequestCookie,
  isCloudflareGoogleAuthActive,
  parseOAuthState,
  verifyGoogleIdToken,
} from "@/lib/cloudflare-google-auth";
import { resolveCanonicalIdentity } from "@/lib/identity-link-server";

/** Handles the Google OAuth callback on Cloudflare Workers. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!isCloudflareGoogleAuthActive()) {
    return Response.json({ error: "Google sign-in is not available." }, { status: 503 });
  }
  const error = url.searchParams.get("error");
  if (error) {
    return redirectTo(url.origin, "/?auth=error", [clearStateCookie()]);
  }
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthState = await parseOAuthState(getRequestCookie(request, "filosage-oauth-state"));
  if (!code || !returnedState || !oauthState || oauthState.state !== returnedState) {
    return redirectTo(url.origin, "/?auth=error", [clearStateCookie()]);
  }
  try {
    const tokens = await exchangeCodeForTokens(request, code, oauthState.codeVerifier);
    if (!tokens.id_token) throw new Error("Google did not return an ID token");
    const identity = await verifyGoogleIdToken(tokens.id_token);
    const user = await resolveCanonicalIdentity(identity);
    const sessionCookie = await createSessionCookie(user);
    return redirectTo(url.origin, oauthState.postLoginPath, [sessionCookie, clearStateCookie()]);
  } catch (callbackError) {
    console.error("Google OAuth callback failed:", callbackError);
    return redirectTo(url.origin, "/?auth=error", [clearStateCookie()]);
  }
}

function redirectTo(origin: string, path: string, cookies: string[]): Response {
  const headers = new Headers({
    Location: new URL(path, origin).toString(),
    "Cache-Control": "no-store",
  });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}
