import { getCloudflareVerifiedUser } from "@/lib/cloudflare-google-auth";
import { createMobileCode, isMobileAuthActive, isValidAppState, isValidCodeChallenge, MOBILE_REDIRECT_URI } from "@/lib/mobile-auth";

/**
 * Step 3 of native sign-in. Reached after /api/auth/google/callback set the
 * web session cookie inside the in-app browser. Converts that session into a
 * short-lived, PKCE-bound code and returns to the app via its URL scheme.
 */
export async function GET(request: Request) {
  if (!isMobileAuthActive()) {
    return Response.json({ error: "App sign-in is not available." }, { status: 503 });
  }
  const url = new URL(request.url);
  const challenge = url.searchParams.get("code_challenge");
  const state = url.searchParams.get("state");
  if (!isValidCodeChallenge(challenge) || !isValidAppState(state)) {
    return Response.json({ error: "Invalid sign-in request." }, { status: 400 });
  }

  const callback = new URL(MOBILE_REDIRECT_URI);
  callback.searchParams.set("state", state);

  const user = await getCloudflareVerifiedUser(request);
  if (!user?.email_verified) {
    callback.searchParams.set("error", "not_signed_in");
  } else {
    callback.searchParams.set("code", await createMobileCode(user, challenge));
  }
  return new Response(null, {
    status: 302,
    headers: { Location: callback.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
