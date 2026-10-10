import { isMobileAuthActive, isValidAppState, isValidCodeChallenge, MOBILE_REDIRECT_URI } from "@/lib/mobile-auth";

/**
 * Step 1 of native sign-in. Opened by the iOS app inside
 * ASWebAuthenticationSession. Hands off to the existing Google OAuth route and
 * asks it to land on /api/auth/mobile/finish afterwards.
 */
export async function GET(request: Request) {
  if (!isMobileAuthActive()) {
    return Response.json({ error: "App sign-in is not available." }, { status: 503 });
  }
  const url = new URL(request.url);
  const challenge = url.searchParams.get("code_challenge");
  const method = url.searchParams.get("code_challenge_method") ?? "S256";
  const state = url.searchParams.get("state");
  const redirectUri = url.searchParams.get("redirect_uri");
  if (!isValidCodeChallenge(challenge) || method !== "S256" || !isValidAppState(state) || redirectUri !== MOBILE_REDIRECT_URI) {
    return Response.json({ error: "Invalid sign-in request." }, { status: 400 });
  }
  const finish = `/api/auth/mobile/finish?code_challenge=${encodeURIComponent(challenge)}&state=${encodeURIComponent(state)}`;
  const destination = new URL("/api/auth/google", url.origin);
  destination.searchParams.set("post_login_redirect_uri", finish);
  return new Response(null, {
    status: 302,
    headers: { Location: destination.toString(), "Cache-Control": "no-store" },
  });
}
