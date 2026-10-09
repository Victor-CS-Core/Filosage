import {
  createOAuthState,
  googleAuthorizationUrl,
  isCloudflareGoogleAuthActive,
  stateCookie,
} from "@/lib/cloudflare-google-auth";

/** Starts the standalone Google OAuth flow on Cloudflare Workers. */
export async function GET(request: Request) {
  if (!isCloudflareGoogleAuthActive()) {
    return Response.json({ error: "Google sign-in is not available." }, { status: 503 });
  }
  const url = new URL(request.url);
  const rawDestination = url.searchParams.get("post_login_redirect_uri") ?? "/";
  let destination = "/";
  try {
    const candidate = new URL(rawDestination, url.origin);
    if (candidate.origin === url.origin) {
      destination = `${candidate.pathname}${candidate.search}${candidate.hash}`;
    }
  } catch {
    destination = "/";
  }
  const { state, cookieValue } = await createOAuthState(destination);
  const authorizationUrl = await googleAuthorizationUrl(request, state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizationUrl,
      "Set-Cookie": stateCookie(cookieValue),
      "Cache-Control": "no-store",
    },
  });
}
