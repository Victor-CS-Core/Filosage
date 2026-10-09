import { clearSessionCookie, isCloudflareGoogleAuthActive } from "@/lib/cloudflare-google-auth";

/** Clears the standalone Google OAuth session on Cloudflare Workers. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawDestination = url.searchParams.get("post_logout_redirect_uri") ?? "/";
  let destination = "/";
  try {
    const candidate = new URL(rawDestination, url.origin);
    if (candidate.origin === url.origin) {
      destination = `${candidate.pathname}${candidate.search}${candidate.hash}`;
    }
  } catch {
    destination = "/";
  }
  const headers = new Headers({
    Location: new URL(destination, url.origin).toString(),
    "Cache-Control": "no-store",
  });
  if (isCloudflareGoogleAuthActive()) {
    headers.append("Set-Cookie", clearSessionCookie());
  }
  return new Response(null, { status: 302, headers });
}
